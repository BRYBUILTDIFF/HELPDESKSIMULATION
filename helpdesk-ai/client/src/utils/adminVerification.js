const tokens = new Map();
export const getAdminVerification = userId => tokens.get(userId) || '';
export const setAdminVerification = (userId, value) => value ? tokens.set(userId, value) : tokens.delete(userId);
export const clearAdminVerification = () => tokens.clear();
