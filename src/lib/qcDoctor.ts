export const QC_DOCTOR_GLOBAL_STATUSES = [
  "current",
  "stale",
  "misconfigured",
  "blocked_upstream",
  "unverifiable",
  "intentional_exception",
] as const;

export type QCDoctorGlobalStatus = typeof QC_DOCTOR_GLOBAL_STATUSES[number];

export const QC_DOCTOR_INSTALLATION_STATES = [
  "compliant",
  "outdated",
  "noncompliant",
  "uninstalled",
  "unknown",
] as const;

export type QCDoctorInstallationState = typeof QC_DOCTOR_INSTALLATION_STATES[number];

const QC_DOCTOR_PROFILE_NAMES = ["python", "bun", "bun-playwright", "rust", "sage"] as const;
const QC_DOCTOR_OBSERVED_PROFILES = [...QC_DOCTOR_PROFILE_NAMES, "unknown"] as const;
const QC_DOCTOR_FINDING_SEVERITIES = ["error", "warning"] as const;
const QC_DOCTOR_FINDING_SURFACES = [
  "manifest",
  "profile",
  "workflow",
  "workflow_ref",
  "justfile_delegation",
  "branch_protection",
] as const;
const QC_DOCTOR_BRANCH_PROTECTION_STATES = [
  "not_applicable",
  "compliant",
  "missing",
  "missing_contexts",
  "unverifiable",
] as const;

export type QCDoctorProfileName = typeof QC_DOCTOR_PROFILE_NAMES[number];
export type QCDoctorObservedProfile = typeof QC_DOCTOR_OBSERVED_PROFILES[number];
export type QCDoctorFindingSeverity = typeof QC_DOCTOR_FINDING_SEVERITIES[number];
export type QCDoctorFindingSurface = typeof QC_DOCTOR_FINDING_SURFACES[number];
export type QCDoctorBranchProtectionState = typeof QC_DOCTOR_BRANCH_PROTECTION_STATES[number];

export interface QCDoctorManifestException {
  id: string;
  surface: QCDoctorFindingSurface;
  reason: string;
  active: boolean;
}

export interface QCDoctorDeclaredManifest {
  schema_version: 1;
  profile: QCDoctorProfileName;
  installed_ref: string;
  release_channel: string;
  workflow_template_version: 1;
  local_delegation: "global-justfile";
  default_branch: string;
  exceptions: QCDoctorManifestException[];
}

export interface QCDoctorMissingManifest {
  present: false;
  reason: string;
}

export type QCDoctorManifest = QCDoctorDeclaredManifest | QCDoctorMissingManifest;

export interface QCDoctorFinding {
  severity: QCDoctorFindingSeverity;
  surface: QCDoctorFindingSurface;
  evidence: string;
  remediation_commands: string[];
}

export interface QCDoctorWorkflowRef {
  path: string;
  required_ref: string;
  observed_ref: string;
  required_gates: string[];
  observed_gates: string[];
}

export interface QCDoctorDelegationCommand {
  present: boolean;
  command: string;
  delegates_to_global_qc: boolean;
  caller_root_preserved: boolean;
}

export interface QCDoctorDelegation {
  required_justfile: string;
  observed: QCDoctorDelegationCommand;
}

export interface QCDoctorBranchProtection {
  required_contexts: string[];
  observed_contexts: string[];
  observed_state: QCDoctorBranchProtectionState;
  evidence: string;
}

export interface QCDoctorProfileProofRequirement {
  profile: QCDoctorProfileName;
  required_paths: string[];
  missing_paths: string[];
}

export interface QCDoctorPayload {
  schema_version: 1;
  tool_version: string;
  target: {
    root: string;
    remote: string;
    head: string;
  };
  declaration: {
    path: string;
    sha256: string;
    manifest: QCDoctorManifest;
  };
  declaration_hash: string;
  declared_profile: QCDoctorObservedProfile;
  effective_profile: QCDoctorObservedProfile;
  workflow_refs: Record<string, QCDoctorWorkflowRef>;
  justfile_delegation: Record<string, QCDoctorDelegation>;
  branch_protection: QCDoctorBranchProtection;
  profile_proof_requirements: Record<string, QCDoctorProfileProofRequirement>;
  findings: QCDoctorFinding[];
  invalidation_inputs: string[];
  installation_state: QCDoctorInstallationState;
  global_status: QCDoctorGlobalStatus;
  exceptions: QCDoctorManifestException[];
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

function requireExactKeys(record: Record<string, unknown>, field: string, keys: string[]) {
  const expected = new Set(keys);
  const actual = Object.keys(record);
  const extras = actual.filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in record));
  if (extras.length > 0 || missing.length > 0) {
    throw new Error(
      `ai-review-ci doctor payload field ${field} has schema drift: missing [${missing.join(", ")}], extra [${extras.join(", ")}].`
    );
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`ai-review-ci doctor payload field ${field} must be a string.`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.length === 0) {
    throw new Error(`ai-review-ci doctor payload field ${field} must be a non-empty string.`);
  }
  return text;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`ai-review-ci doctor payload field ${field} must be a boolean.`);
  }
  return value;
}

function requireLiteral<T extends string | number | boolean>(value: unknown, expected: T, field: string): T {
  if (value !== expected) {
    throw new Error(`ai-review-ci doctor payload field ${field} must be ${String(expected)}.`);
  }
  return expected;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`ai-review-ci doctor payload field ${field} must be an array of strings.`);
  }
  return value;
}

function requireEnum<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  if (typeof value !== "string") {
    throw new Error(`ai-review-ci doctor payload field ${field} must be a string.`);
  }
  if (!values.includes(value as T)) {
    throw new Error(`Unsupported ai-review-ci doctor ${field}: ${value}`);
  }
  return value as T;
}

function parseRecordMap<T>(
  value: unknown,
  field: string,
  parseItem: (item: unknown, itemField: string) => T
): Record<string, T> {
  const record = requireRecord(value, field);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, parseItem(item, `${field}.${key}`)])
  );
}

function parseManifestException(value: unknown, field: string): QCDoctorManifestException {
  const exception = requireRecord(value, field);
  requireExactKeys(exception, field, ["id", "surface", "reason", "active"]);
  return {
    id: requireString(exception.id, `${field}.id`),
    surface: requireEnum(exception.surface, `${field}.surface`, QC_DOCTOR_FINDING_SURFACES),
    reason: requireString(exception.reason, `${field}.reason`),
    active: requireBoolean(exception.active, `${field}.active`),
  };
}

function parseManifestExceptions(value: unknown, field: string): QCDoctorManifestException[] {
  if (!Array.isArray(value)) {
    throw new Error(`ai-review-ci doctor payload field ${field} must be an array.`);
  }
  return value.map((item, index) => parseManifestException(item, `${field}[${index}]`));
}

function parseManifest(value: unknown, field: string): QCDoctorManifest {
  const manifest = requireRecord(value, field);
  if (manifest.present === false) {
    requireExactKeys(manifest, field, ["present", "reason"]);
    return {
      present: requireLiteral(manifest.present, false, `${field}.present`),
      reason: requireString(manifest.reason, `${field}.reason`),
    };
  }

  requireExactKeys(manifest, field, [
    "schema_version",
    "profile",
    "installed_ref",
    "release_channel",
    "workflow_template_version",
    "local_delegation",
    "default_branch",
    "exceptions",
  ]);
  return {
    schema_version: requireLiteral(manifest.schema_version, 1, `${field}.schema_version`),
    profile: requireEnum(manifest.profile, `${field}.profile`, QC_DOCTOR_PROFILE_NAMES),
    installed_ref: requireNonEmptyString(manifest.installed_ref, `${field}.installed_ref`),
    release_channel: requireNonEmptyString(manifest.release_channel, `${field}.release_channel`),
    workflow_template_version: requireLiteral(manifest.workflow_template_version, 1, `${field}.workflow_template_version`),
    local_delegation: requireLiteral(manifest.local_delegation, "global-justfile", `${field}.local_delegation`),
    default_branch: requireNonEmptyString(manifest.default_branch, `${field}.default_branch`),
    exceptions: parseManifestExceptions(manifest.exceptions, `${field}.exceptions`),
  };
}

function parseTarget(value: unknown): QCDoctorPayload["target"] {
  const target = requireRecord(value, "target");
  requireExactKeys(target, "target", ["root", "remote", "head"]);
  return {
    root: requireString(target.root, "target.root"),
    remote: requireString(target.remote, "target.remote"),
    head: requireString(target.head, "target.head"),
  };
}

function parseDeclaration(value: unknown): QCDoctorPayload["declaration"] {
  const declaration = requireRecord(value, "declaration");
  requireExactKeys(declaration, "declaration", ["path", "sha256", "manifest"]);
  return {
    path: requireString(declaration.path, "declaration.path"),
    sha256: requireString(declaration.sha256, "declaration.sha256"),
    manifest: parseManifest(declaration.manifest, "declaration.manifest"),
  };
}

function parseWorkflowRef(value: unknown, field: string): QCDoctorWorkflowRef {
  const workflow = requireRecord(value, field);
  requireExactKeys(workflow, field, ["path", "required_ref", "observed_ref", "required_gates", "observed_gates"]);
  return {
    path: requireString(workflow.path, `${field}.path`),
    required_ref: requireString(workflow.required_ref, `${field}.required_ref`),
    observed_ref: requireString(workflow.observed_ref, `${field}.observed_ref`),
    required_gates: requireStringArray(workflow.required_gates, `${field}.required_gates`),
    observed_gates: requireStringArray(workflow.observed_gates, `${field}.observed_gates`),
  };
}

function parseDelegationCommand(value: unknown, field: string): QCDoctorDelegationCommand {
  const command = requireRecord(value, field);
  requireExactKeys(command, field, ["present", "command", "delegates_to_global_qc", "caller_root_preserved"]);
  return {
    present: requireBoolean(command.present, `${field}.present`),
    command: requireString(command.command, `${field}.command`),
    delegates_to_global_qc: requireBoolean(command.delegates_to_global_qc, `${field}.delegates_to_global_qc`),
    caller_root_preserved: requireBoolean(command.caller_root_preserved, `${field}.caller_root_preserved`),
  };
}

function parseDelegation(value: unknown, field: string): QCDoctorDelegation {
  const delegation = requireRecord(value, field);
  requireExactKeys(delegation, field, ["required_justfile", "observed"]);
  return {
    required_justfile: requireString(delegation.required_justfile, `${field}.required_justfile`),
    observed: parseDelegationCommand(delegation.observed, `${field}.observed`),
  };
}

function parseBranchProtection(value: unknown): QCDoctorBranchProtection {
  const branchProtection = requireRecord(value, "branch_protection");
  requireExactKeys(branchProtection, "branch_protection", [
    "required_contexts",
    "observed_contexts",
    "observed_state",
    "evidence",
  ]);
  return {
    required_contexts: requireStringArray(branchProtection.required_contexts, "branch_protection.required_contexts"),
    observed_contexts: requireStringArray(branchProtection.observed_contexts, "branch_protection.observed_contexts"),
    observed_state: requireEnum(
      branchProtection.observed_state,
      "branch_protection.observed_state",
      QC_DOCTOR_BRANCH_PROTECTION_STATES
    ),
    evidence: requireString(branchProtection.evidence, "branch_protection.evidence"),
  };
}

function parseProfileProofRequirement(value: unknown, field: string): QCDoctorProfileProofRequirement {
  const proof = requireRecord(value, field);
  requireExactKeys(proof, field, ["profile", "required_paths", "missing_paths"]);
  return {
    profile: requireEnum(proof.profile, `${field}.profile`, QC_DOCTOR_PROFILE_NAMES),
    required_paths: requireStringArray(proof.required_paths, `${field}.required_paths`),
    missing_paths: requireStringArray(proof.missing_paths, `${field}.missing_paths`),
  };
}

function parseFinding(value: unknown, field: string): QCDoctorFinding {
  const finding = requireRecord(value, field);
  requireExactKeys(finding, field, ["severity", "surface", "evidence", "remediation_commands"]);
  return {
    severity: requireEnum(finding.severity, `${field}.severity`, QC_DOCTOR_FINDING_SEVERITIES),
    surface: requireEnum(finding.surface, `${field}.surface`, QC_DOCTOR_FINDING_SURFACES),
    evidence: requireString(finding.evidence, `${field}.evidence`),
    remediation_commands: requireStringArray(finding.remediation_commands, `${field}.remediation_commands`),
  };
}

function parseFindings(value: unknown): QCDoctorFinding[] {
  if (!Array.isArray(value)) {
    throw new Error("ai-review-ci doctor payload field findings must be an array.");
  }
  return value.map((item, index) => parseFinding(item, `findings[${index}]`));
}

function parseRootPayload(value: unknown): QCDoctorPayload {
  const payload = requireRecord(value, "root");
  requireExactKeys(payload, "root", [
    "schema_version",
    "tool_version",
    "target",
    "declaration",
    "declaration_hash",
    "declared_profile",
    "effective_profile",
    "workflow_refs",
    "justfile_delegation",
    "branch_protection",
    "profile_proof_requirements",
    "findings",
    "invalidation_inputs",
    "installation_state",
    "global_status",
    "exceptions",
  ]);

  return {
    schema_version: requireLiteral(payload.schema_version, 1, "schema_version"),
    tool_version: requireString(payload.tool_version, "tool_version"),
    target: parseTarget(payload.target),
    declaration: parseDeclaration(payload.declaration),
    declaration_hash: requireString(payload.declaration_hash, "declaration_hash"),
    declared_profile: requireEnum(payload.declared_profile, "declared_profile", QC_DOCTOR_OBSERVED_PROFILES),
    effective_profile: requireEnum(payload.effective_profile, "effective_profile", QC_DOCTOR_OBSERVED_PROFILES),
    workflow_refs: parseRecordMap(payload.workflow_refs, "workflow_refs", parseWorkflowRef),
    justfile_delegation: parseRecordMap(payload.justfile_delegation, "justfile_delegation", parseDelegation),
    branch_protection: parseBranchProtection(payload.branch_protection),
    profile_proof_requirements: parseRecordMap(
      payload.profile_proof_requirements,
      "profile_proof_requirements",
      parseProfileProofRequirement
    ),
    findings: parseFindings(payload.findings),
    invalidation_inputs: requireStringArray(payload.invalidation_inputs, "invalidation_inputs"),
    installation_state: requireEnum(payload.installation_state, "installation_state", QC_DOCTOR_INSTALLATION_STATES),
    global_status: requireEnum(payload.global_status, "global_status", QC_DOCTOR_GLOBAL_STATUSES),
    exceptions: parseManifestExceptions(payload.exceptions, "exceptions"),
  };
}

export function parseQCDoctorPayload(raw: unknown): QCDoctorPayload {
  return parseRootPayload(raw);
}

const QC_DOCTOR_CHECK_RUN_FENCE_NAME = "ai-review-ci-doctor-json";
const QC_DOCTOR_CHECK_RUN_FENCE_PATTERN = /```ai-review-ci-doctor-json[^\S\r\n]*\r?\n([\s\S]*?)```/gi;

export function parseQCDoctorPayloadFromText(text: string): QCDoctorPayload {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("ai-review-ci doctor payload text is empty.");
  }

  const candidates: string[] = [];
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    candidates.push(trimmed);
  }

  for (const match of trimmed.matchAll(QC_DOCTOR_CHECK_RUN_FENCE_PATTERN)) {
    candidates.push(match[1].trim());
  }

  if (candidates.length === 0) {
    throw new Error(
      `ai-review-ci doctor payload text must be raw JSON or a fenced ${QC_DOCTOR_CHECK_RUN_FENCE_NAME} block.`
    );
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
