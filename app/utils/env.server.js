const isDevelopmentEnv = process.env.NODE_ENV !== 'production';

export function getEnvWithDevOverride(key, fallback = undefined) {
  const devKey = `DEV_${key}`;

  if (isDevelopmentEnv) {
    const devValue = process.env[devKey];
    if (devValue !== undefined && devValue !== '') {
      return devValue;
    }
  }

  const value = process.env[key];
  if (value === undefined || value === '') {
    return fallback;
  }

  return value;
}

export { isDevelopmentEnv };
