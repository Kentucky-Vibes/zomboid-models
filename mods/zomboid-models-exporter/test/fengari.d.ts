declare module 'fengari' {
  export type LuaState = object;
  export const lua: {
    LUA_OK: number;
    lua_tojsstring(L: LuaState, index: number): string;
    lua_pop(L: LuaState, n: number): void;
    lua_gettop(L: LuaState): number;
  };
  export const lauxlib: {
    luaL_newstate(): LuaState;
    luaL_loadstring(L: LuaState, code: Uint8Array): number;
    luaL_dostring(L: LuaState, code: Uint8Array): number;
  };
  export const lualib: {
    luaL_openlibs(L: LuaState): void;
  };
  export function to_luastring(text: string): Uint8Array;
  export function to_jsstring(bytes: Uint8Array): string;
}
