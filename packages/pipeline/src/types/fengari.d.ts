declare module 'fengari' {
  export type LuaState = object;
  export const lua: {
    LUA_OK: number;
    LUA_TNIL: number;
    LUA_TBOOLEAN: number;
    LUA_TNUMBER: number;
    LUA_TSTRING: number;
    LUA_TTABLE: number;
    lua_type(L: LuaState, index: number): number;
    lua_tojsstring(L: LuaState, index: number): string;
    lua_tonumber(L: LuaState, index: number): number;
    lua_toboolean(L: LuaState, index: number): boolean;
    lua_absindex(L: LuaState, index: number): number;
    lua_pushnil(L: LuaState): void;
    lua_next(L: LuaState, index: number): number;
    lua_pop(L: LuaState, n: number): void;
    lua_getglobal(L: LuaState, name: Uint8Array): number;
    lua_gettop(L: LuaState): number;
    lua_close(L: LuaState): void;
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
