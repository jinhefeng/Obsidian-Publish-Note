export class ProvisioningError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 502) { super(message); this.name = "ProvisioningError"; this.code = code; this.status = status; }
}
