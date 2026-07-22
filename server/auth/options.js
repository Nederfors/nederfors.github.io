export const AUTH_BASE_PATH = '/api/auth';

export function buildAuthSchemaOptions() {
  return {
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false
    }
  };
}

export function buildAuthOptions(config) {
  const schemaOptions = buildAuthSchemaOptions();
  const ipAddress = config.auth.trustedProxies.length > 0
    ? { trustedProxies: [...config.auth.trustedProxies] }
    : { disableIpTracking: true };

  return {
    ...schemaOptions,
    appName: 'Symbapedia',
    baseURL: config.auth.baseUrl,
    basePath: AUTH_BASE_PATH,
    secret: config.auth.secret,
    ...(config.auth.secrets ? { secrets: [...config.auth.secrets] } : {}),
    trustedOrigins: [config.auth.baseUrl],
    emailAndPassword: {
      ...schemaOptions.emailAndPassword,
      disableSignUp: !config.auth.signupEnabled
    },
    session: {
      cookieCache: { enabled: false }
    },
    advanced: {
      ipAddress,
      disableCSRFCheck: false,
      disableOriginCheck: false
    },
    onAPIError: { throw: true },
    logger: { disabled: true }
  };
}
