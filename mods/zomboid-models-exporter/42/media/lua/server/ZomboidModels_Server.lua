--- Server side: one document per online player, refreshed every ten in-game minutes and
--- whenever a client asks through `sendClientCommand(player, "ZomboidModels", "export", {})`,
--- plus `players.json`, the index of every player exported so far with their online state.

require 'ZomboidModels/Exporter'

if isServer() then
    local function exportAll()
        local players = getOnlinePlayers()
        if players == nil then return end
        local online = {}
        for i = 0, players:size() - 1 do
            local player = players:get(i)
            ZomboidModels.export(player)
            local username = player:getUsername()
            if username ~= nil then online[username] = true end
        end
        ZomboidModels.markOffline(online)
        ZomboidModels.writeIndex()
    end

    local function onClientCommand(module, command, player, args)
        if module == 'ZomboidModels' and command == 'export' then
            ZomboidModels.export(player)
            ZomboidModels.writeIndex()
        end
    end

    Events.EveryTenMinutes.Add(exportAll)
    Events.OnClientCommand.Add(onClientCommand)
end
