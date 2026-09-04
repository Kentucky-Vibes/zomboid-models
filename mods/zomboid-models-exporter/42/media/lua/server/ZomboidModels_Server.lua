--- Server side: one document per online player, refreshed every ten in-game minutes and
--- whenever a client asks through `sendClientCommand(player, "ZomboidModels", "export", {})`.

require 'ZomboidModels/Exporter'

if isServer() then
    local function exportAll()
        local players = getOnlinePlayers()
        if players == nil then return end
        for i = 0, players:size() - 1 do
            ZomboidModels.export(players:get(i))
        end
    end

    local function onClientCommand(module, command, player, args)
        if module == 'ZomboidModels' and command == 'export' then
            ZomboidModels.export(player)
        end
    end

    Events.EveryTenMinutes.Add(exportAll)
    Events.OnClientCommand.Add(onClientCommand)
end
