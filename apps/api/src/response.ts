export const ok = <T>(data: T) => ({ success: true as const, data });
export const SESSION_COOKIE = 'sp_session';
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 86400000,
};
