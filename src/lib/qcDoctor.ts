export const QC_DOCTOR_GLOBAL_STATUSES = [
  "current",
  "stale",
  "misconfigured",
  "blocked_upstream",
  "unverifiable",
  "intentional_exception",
] as const;

export type QCDoctorGlobalStatus = typeof QC_DOCTOR_GLOBAL_STATUSES[number];

export interface QCDoctorFinding {
  severity: string;
  surface: string;
  evidence: string;
  remediation_commands: string[];
}

export interface QCDoctorPayload {
  schema_version: number;
  tool: {
    name: string;
    version: string;
    ref: string;
  };
  repository: {
    root: string;
    remote: string;
    full_name: string;
  };
  declared_profile: string;
  effective_profile: string;
  installation_state: string;
  global_status: QCDoctorGlobalStatus;
  findings: QCDoctorFinding[];
  invalidation_inputs: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`ai-review-ci doctor payload field ${field} must be an object.`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`ai-review-ci doctor payload field ${field} must be a non-empty string.`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`ai-review-ci doctor payload field ${field} must be an array of strings.`);
  }
  return value;
}

function requireGlobalStatus(value: unknown): QCDoctorGlobalStatus {
  if (typeof value !== "string") {
    throw new Error("ai-review-ci doctor payload field global_status must be a string.");
  }
  if (!QC_DOCTOR_GLOBAL_STATUSES.includes(value as QCDoctorGlobalStatus)) {
    throw new Error(`Unsupported ai-review-ci doctor global_status: ${value}`);
  }
  return value as QCDoctorGlobalStatus;
}

function parseFindings(value: unknown): QCDoctorFinding[] {
  if (!Array.isArray(value)) {
    throw new Error("ai-review-ci doctor payload field findings must be an array.");
  }

  return value.map((item, index) => {
    const finding = requireRecord(item, `findings[${index}]`);
    return {
      severity: requireString(finding.severity, `findings[${index}].severity`),
      surface: requireString(finding.surface, `findings[${index}].surface`),
      evidence: requireString(finding.evidence, `findings[${index}].evidence`),
      remediation_commands: requireStringArray(
        finding.remediation_commands,
        `findings[${index}].remediation_commands`
      ),
    };
  });
}

function parseStringRecord(value: unknown, field: string): Record<string, string> {
  const record = requireRecord(value, field);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, requireString(item, `${field}.${key}`)])
  );
}

export function parseQCDoctorPayload(raw: unknown): QCDoctorPayload {
  const payload = requireRecord(raw, "root");
  const schemaVersion = payload.schema_version;
  if (typeof schemaVersion !== "number") {
    throw new Error("ai-review-ci doctor payload field schema_version must be a number.");
  }

  const tool = requireRecord(payload.tool, "tool");
  const repository = requireRecord(payload.repository, "repository");

  return {
    schema_version: schemaVersion,
    tool: {
      name: requireString(tool.name, "tool.name"),
      version: requireString(tool.version, "tool.version"),
      ref: requireString(tool.ref, "tool.ref"),
    },
    repository: {
      root: requireString(repository.root, "repository.root"),
      remote: requireString(repository.remote, "repository.remote"),
      full_name: requireString(repository.full_name, "repository.full_name"),
    },
    declared_profile: requireString(payload.declared_profile, "declared_profile"),
    effective_profile: requireString(payload.effective_profile, "effective_profile"),
    installation_state: requireString(payload.installation_state, "installation_state"),
    global_status: requireGlobalStatus(payload.global_status),
    findings: parseFindings(payload.findings),
    invalidation_inputs: parseStringRecord(payload.invalidation_inputs, "invalidation_inputs"),
  };
}

export function parseQCDoctorPayloadFromText(text: string): QCDoctorPayload {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("ai-review-ci doctor payload text is empty.");
  }

  const candidates = [
    trimmed,
    ...Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map((match) => match[1].trim()),
  ];

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      return parseQCDoctorPayload(JSON.parse(candidate));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Could not parse ai-review-ci doctor payload from text: ${errors.join("; ")}`);
}
