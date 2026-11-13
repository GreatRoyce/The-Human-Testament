const invalid = () => Object.assign(new Error('Invalid email configuration.'), { code: 'MAIL_CONFIGURATION_INVALID' });

// One ASCII mailbox per message. Reject address lists and control/header characters.
function validMailbox(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\s\x00-\x1f\x7f]/.test(value)) return false;
  const parts = value.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[0].length <= 64 &&
    /^[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/.test(parts[0]) &&
    parts[1].includes('.') && parts[1].split('.').every(label =>
      label.length <= 63 && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label));
}

function validSender(value) {
  if (validMailbox(value)) return true;
  // The app's configured brand name is ASCII; quoted or international display names
  // require a MIME-aware formatter before this contract can be expanded.
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) return false;
  const named = /^([a-zA-Z0-9][a-zA-Z0-9 .'-]{0,63}) <([^<>]+)>$/.exec(value);
  return Boolean(named && validMailbox(named[2]));
}

function getGmailConfig(env = process.env) {
  const values = [env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REFRESH_TOKEN];
  if (env.MAIL_PROVIDER !== 'gmail' || !validSender(env.MAIL_FROM) ||
      values.some(value => typeof value !== 'string' || !value || /[\s\x00-\x1f\x7f]/.test(value))) throw invalid();
  return { from: env.MAIL_FROM, clientId: values[0], clientSecret: values[1], refreshToken: values[2] };
}

module.exports = { getGmailConfig, validMailbox };
