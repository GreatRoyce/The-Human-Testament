function passwordResetEmail({ to, link, minutes }) {
  return { to, subject: 'Reset your Human Testament password',
    text: `A password reset was requested for your Human Testament account.\n\nUse this link within ${minutes} minutes:\n${link}\n\nIf you did not request this, you can ignore this email. Your password has not changed.` };
}
module.exports = { passwordResetEmail };
