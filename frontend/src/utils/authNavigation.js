const permittedReturnPath = /^\/(?:dashboard|testament|reading|community|articles|notifications|account)(?:\/|\?|$)/;
const permittedAnalyticsPath = /^\/(?:owner|admin)\/analytics$/;
const permittedAdminPath = /^\/admin(?:\/(?:users(?:\/[a-f0-9]{24})?|articles(?:\/[a-f0-9]{24})?|community|reports|audit))?$/;

export function loginDestination(returnTo) {
  return typeof returnTo === 'string' &&
    (permittedReturnPath.test(returnTo) || permittedAnalyticsPath.test(returnTo) || permittedAdminPath.test(returnTo))
    ? returnTo
    : '/dashboard';
}
