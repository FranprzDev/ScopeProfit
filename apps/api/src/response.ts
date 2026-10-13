export const ok = <T>(data: T) => ({ success: true as const, data });
export const SESSION_COOKIE = 'sp_session';
export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 86400000,
};
