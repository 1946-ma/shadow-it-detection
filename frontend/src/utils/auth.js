const TOKEN_KEY = "sit_token";
const USER_KEY  = "sit_user";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const getUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); }
  catch { return null; }
};

export const setAuth = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const isAdmin         = () => getUser()?.role === "admin";
export const isAuthenticated = () => !!getToken();
