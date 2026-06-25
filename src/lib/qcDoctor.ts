import * as z from "zod";

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

const NonEmptyStringSchema = z.string().min(1);
const QCDoctorProfileNameSchema = z.enum(QC_DOCTOR_PROFILE_NAMES);
const QCDoctorObservedProfileSchema = z.enum(QC_DOCTOR_OBSERVED_PROFILES);
const QCDoctorFindingSeveritySchema = z.enum(QC_DOCTOR_FINDING_SEVERITIES);
const QCDoctorFindingSurfaceSchema = z.enum(QC_DOCTOR_FINDING_SURFACES);
const QCDoctorBranchProtectionStateSchema = z.enum(QC_DOCTOR_BRANCH_PROTECTION_STATES);
const QCDoctorInstallationStateSchema = z.enum(QC_DOCTOR_INSTALLATION_STATES);

export const QCDoctorManifestExceptionSchema = z.strictObject({
  id: z.string(),
  surface: QCDoctorFindingSurfaceSchema,
  reason: z.string(),
  active: z.boolean(),
});
export type QCDoctorManifestException = z.infer<typeof QCDoctorManifestExceptionSchema>;

export const QCDoctorDeclaredManifestSchema = z.strictObject({
  schema_version: z.literal(1),
  profile: QCDoctorProfileNameSchema,
  installed_ref: NonEmptyStringSchema,
  release_channel: NonEmptyStringSchema,
  workflow_template_version: z.literal(1),
  local_delegation: z.literal("global-justfile"),
  default_branch: NonEmptyStringSchema,
  exceptions: z.array(QCDoctorManifestExceptionSchema),
});
export type QCDoctorDeclaredManifest = z.infer<typeof QCDoctorDeclaredManifestSchema>;

export const QCDoctorMissingManifestSchema = z.strictObject({
  present: z.literal(false),
  reason: z.string(),
});
export type QCDoctorMissingManifest = z.infer<typeof QCDoctorMissingManifestSchema>;

export const QCDoctorManifestSchema = z.union([
  QCDoctorDeclaredManifestSchema,
  QCDoctorMissingManifestSchema,
]);
export type QCDoctorManifest = z.infer<typeof QCDoctorManifestSchema>;

export const QCDoctorFindingSchema = z.strictObject({
  severity: QCDoctorFindingSeveritySchema,
  surface: QCDoctorFindingSurfaceSchema,
  evidence: z.string(),
  remediation_commands: z.array(z.string()),
});
export type QCDoctorFinding = z.infer<typeof QCDoctorFindingSchema>;

export const QCDoctorWorkflowRefSchema = z.strictObject({
  path: z.string(),
  required_ref: z.string(),
  observed_ref: z.string(),
  required_gates: z.array(z.string()),
  observed_gates: z.array(z.string()),
});
export type QCDoctorWorkflowRef = z.infer<typeof QCDoctorWorkflowRefSchema>;

export const QCDoctorDelegationCommandSchema = z.strictObject({
  present: z.boolean(),
  command: z.string(),
  delegates_to_global_qc: z.boolean(),
  caller_root_preserved: z.boolean(),
});
export type QCDoctorDelegationCommand = z.infer<typeof QCDoctorDelegationCommandSchema>;

export const QCDoctorDelegationSchema = z.strictObject({
  required_justfile: z.string(),
  observed: QCDoctorDelegationCommandSchema,
});
export type QCDoctorDelegation = z.infer<typeof QCDoctorDelegationSchema>;

export const QCDoctorBranchProtectionSchema = z.strictObject({
  required_contexts: z.array(z.string()),
  observed_contexts: z.array(z.string()),
  observed_state: QCDoctorBranchProtectionStateSchema,
  evidence: z.string(),
});
export type QCDoctorBranchProtection = z.infer<typeof QCDoctorBranchProtectionSchema>;

export const QCDoctorProfileProofRequirementSchema = z.strictObject({
  profile: QCDoctorProfileNameSchema,
  required_paths: z.array(z.string()),
  missing_paths: z.array(z.string()),
});
export type QCDoctorProfileProofRequirement = z.infer<typeof QCDoctorProfileProofRequirementSchema>;

export const QCDoctorPayloadSchema = z.strictObject({
  schema_version: z.literal(1),
  tool_version: z.string(),
  target: z.strictObject({
    root: z.string(),
    remote: z.string(),
    head: z.string(),
  }),
  declaration: z.strictObject({
    path: z.string(),
    sha256: z.string(),
    manifest: QCDoctorManifestSchema,
  }),
  declaration_hash: z.string(),
  declared_profile: QCDoctorObservedProfileSchema,
  effective_profile: QCDoctorObservedProfileSchema,
  workflow_refs: z.record(z.string(), QCDoctorWorkflowRefSchema),
  justfile_delegation: z.record(z.string(), QCDoctorDelegationSchema),
  branch_protection: QCDoctorBranchProtectionSchema,
  profile_proof_requirements: z.record(z.string(), QCDoctorProfileProofRequirementSchema),
  findings: z.array(QCDoctorFindingSchema),
  invalidation_inputs: z.array(z.string()),
  installation_state: QCDoctorInstallationStateSchema,
  global_status: z.enum(QC_DOCTOR_GLOBAL_STATUSES),
  exceptions: z.array(QCDoctorManifestExceptionSchema),
});
export type QCDoctorPayload = z.infer<typeof QCDoctorPayloadSchema>;

export interface QCHealthFinding {
  severity: QCDoctorFinding["severity"];
  surface: QCDoctorFinding["surface"] | "doctor_command" | "qc-doctor";
  evidence: string;
  remediation_commands: string[];
}

export interface QCHealth {
  global_status: QCDoctorGlobalStatus;
  source: "local_doctor" | "qc_doctor_check" | "unavailable";
  source_detail: string;
  findings: QCHealthFinding[];
  payload?: QCDoctorPayload;
  error?: string;
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  }).join("; ");
}

export function parseQCDoctorPayload(raw: unknown): QCDoctorPayload {
  const result = QCDoctorPayloadSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`ai-review-ci doctor payload schema drift: ${formatZodError(result.error)}`);
  }
  return result.data;
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
