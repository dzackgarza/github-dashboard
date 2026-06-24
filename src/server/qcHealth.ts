import { spawnSync } from "node:child_process";
import { parseQCDoctorPayloadFromText } from "../lib/qcDoctor";
import type {
  QCHealth,
  QCDoctorPayload,
} from "../lib/qcDoctor";
import { LocalCheckoutStatus, normalizeGitHubRemote } from "./localCheckouts";

export type { QCHealth };

export interface CheckRunOutput {
  name: string;
  status: string;
  conclusion: string | null;
  output?: {
    title?: string;
    summary?: string;
    text?: string;
  };
}

export interface CommandResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

export type CommandRunner = (command: string, args: string[]) => CommandResult;

export interface LocalDoctorCommand {
  command: string;
  baseArgs: string[];
}

export const AI_REVIEW_CI_DOCTOR_COMMAND: LocalDoctorCommand = {
  command: "uvx",
  baseArgs: [
    "--python",
    "3.14",
    "--from",
    "git+https://github.com/dzackgarza/ai-review-ci",
    "ai-review-ci",
    "doctor",
  ],
};

export interface DoctorCommandInvocation {
  command: string;
  args: string[];
}

export function buildLocalDoctorCommand(checkout: LocalCheckoutStatus, doctorCommand = AI_REVIEW_CI_DOCTOR_COMMAND): DoctorCommandInvocation {
  return {
    command: doctorCommand.command,
    args: [...doctorCommand.baseArgs, "--target", checkout.path, "--json"],
  };
}

export const spawnCommandRunner: CommandRunner = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error ? result.error.message : null,
  };
};

function healthFromPayload(payload: QCDoctorPayload, source: QCHealth["source"], sourceDetail: string): QCHealth {
  return {
    global_status: payload.global_status,
    source,
    source_detail: sourceDetail,
    findings: payload.findings,
    payload,
  };
}

export function unavailableQCHealth(fullName: string, sourceDetail: string): QCHealth {
  return {
    global_status: "unverifiable",
    source: "unavailable",
    source_detail: sourceDetail,
    findings: [
      {
        severity: "error",
        surface: "qc-doctor",
        evidence: `No ai-review-ci doctor payload source was available for ${fullName}.`,
        remediation_commands: [],
      },
    ],
  };
}

function formatCommandFailure(invocation: DoctorCommandInvocation, result: CommandResult, parseError: unknown): string {
  const parseDetail = parseError instanceof Error ? parseError.message : String(parseError);
  const exitDetail = result.error
    ? `spawn error: ${result.error}`
    : `exit status: ${result.status}, signal: ${result.signal}`;
  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();
  return [
    `Local ai-review-ci doctor command failed to produce a parseable doctor payload.`,
    `command: ${invocation.command} ${invocation.args.join(" ")}`,
    exitDetail,
    `parse error: ${parseDetail}`,
    stderr ? `stderr: ${stderr}` : "",
    stdout ? `stdout: ${stdout}` : "",
  ].filter(Boolean).join("\n");
}

function localDoctorFailureHealth(checkout: LocalCheckoutStatus, evidence: string): QCHealth {
  return {
    global_status: "unverifiable",
    source: "local_doctor",
    source_detail: `Local ai-review-ci doctor --target ${checkout.path} --json failed.`,
    findings: [
      {
        severity: "error",
        surface: "doctor_command",
        evidence,
        remediation_commands: [
          "uvx --python 3.14 --from git+https://github.com/dzackgarza/ai-review-ci ai-review-ci doctor --target <checkout-path> --json",
        ],
      },
    ],
    error: evidence,
  };
}

function assertPayloadMatchesLocalCheckout(fullName: string, checkout: LocalCheckoutStatus, payload: QCDoctorPayload) {
  if (payload.target.root !== checkout.path) {
    throw new Error(`local doctor target ${payload.target.root} does not match checkout ${checkout.path}.`);
  }
  const payloadFullName = normalizeGitHubRemote(payload.target.remote);
  if (payloadFullName !== fullName) {
    throw new Error(`local doctor target remote ${payload.target.remote} does not match ${fullName}.`);
  }
}

export function localDoctorQCHealth(
  fullName: string,
  checkout: LocalCheckoutStatus,
  commandRunner = spawnCommandRunner,
  doctorCommand = AI_REVIEW_CI_DOCTOR_COMMAND
): QCHealth {
  const invocation = buildLocalDoctorCommand(checkout, doctorCommand);
  const result = commandRunner(invocation.command, invocation.args);

  try {
    const payload = parseQCDoctorPayloadFromText(result.stdout);
    assertPayloadMatchesLocalCheckout(fullName, checkout, payload);
    return healthFromPayload(payload, "local_doctor", `Local ai-review-ci doctor --target ${checkout.path} --json`);
  } catch (error) {
    return localDoctorFailureHealth(checkout, formatCommandFailure(invocation, result, error));
  }
}

export function extractQCDoctorHealthFromCheckRuns(fullName: string, checkRuns: CheckRunOutput[]): QCHealth | null {
  const doctorRun = checkRuns.find((run) => run.name === "qc-doctor");
  if (!doctorRun) {
    return null;
  }

  const text = [
    doctorRun.output?.title,
    doctorRun.output?.summary,
    doctorRun.output?.text,
  ].filter(Boolean).join("\n");

  const payload = parseQCDoctorPayloadFromText(text);
  const payloadFullName = normalizeGitHubRemote(payload.target.remote);
  if (payloadFullName !== fullName) {
    throw new Error(`qc-doctor payload target remote ${payload.target.remote} does not match ${fullName}.`);
  }

  return healthFromPayload(payload, "qc_doctor_check", `GitHub check run ${doctorRun.name}`);
}

export function resolveQCHealthForProjection(
  fullName: string,
  checkout: LocalCheckoutStatus | null,
  checkRuns: CheckRunOutput[],
  commandRunner = spawnCommandRunner,
  doctorCommand = AI_REVIEW_CI_DOCTOR_COMMAND
): QCHealth {
  if (checkout) {
    return localDoctorQCHealth(fullName, checkout, commandRunner, doctorCommand);
  }

  return extractQCDoctorHealthFromCheckRuns(fullName, checkRuns)
    ?? unavailableQCHealth(fullName, "No qc-doctor check output or local ai-review-ci doctor payload was available.");
}
