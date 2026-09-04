declare module 'gltf-validator' {
  export interface ValidationIssue {
    code: string;
    message: string;
    severity: number;
    pointer?: string;
  }

  export interface ValidationReport {
    issues: {
      numErrors: number;
      numWarnings: number;
      numInfos: number;
      numHints: number;
      messages: ValidationIssue[];
    };
    info?: Record<string, unknown>;
  }

  export interface ValidationOptions {
    uri?: string;
    format?: 'glb' | 'gltf';
    maxIssues?: number;
    ignoredIssues?: string[];
    onlyIssues?: string[];
    severityOverrides?: Record<string, number>;
    externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
  }

  export function validateBytes(
    data: Uint8Array,
    options?: ValidationOptions,
  ): Promise<ValidationReport>;
  export const version: string;
}
