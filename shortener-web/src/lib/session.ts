const KEY = 'shortener.token';

export const loadToken = (): string | null => sessionStorage.getItem(KEY);
export const saveToken = (token: string): void => sessionStorage.setItem(KEY, token);
export const clearToken = (): void => sessionStorage.removeItem(KEY);
