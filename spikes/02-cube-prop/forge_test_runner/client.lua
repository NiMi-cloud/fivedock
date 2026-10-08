-- Spieltest-Helfer für generierte Props.
--   /prop <modellname>   lädt das Modell und platziert es 3 m vor dir
--   /propclear           entfernt alle mit /prop erzeugten Objekte
-- Die Ausgabe erscheint im Chat und in der F8-Konsole.

local spawned = {}

local function say(msg)
    print('[forge_test_runner] ' .. msg)
    TriggerEvent('chat:addMessage', { args = { '[forge]', msg } })
end

RegisterCommand('prop', function(_, args)
    local name = args[1]
    if not name then
        say('Aufruf: /prop <modellname>')
        return
    end

    local hash = joaat(name)
    say(('Modell "%s" hash=%d'):format(name, hash))
    say(('IsModelInCdimage=%s IsModelValid=%s'):format(tostring(IsModelInCdimage(hash)), tostring(IsModelValid(hash))))

    RequestModel(hash)
    local waited = 0
    while not HasModelLoaded(hash) and waited < 5000 do
        Wait(50)
        waited = waited + 50
    end

    if not HasModelLoaded(hash) then
        say(('FEHLER: Modell nach %d ms nicht geladen. Stream-Datei, ytyp oder Name falsch?'):format(waited))
        return
    end

    local ped = PlayerPedId()
    local pos = GetOffsetFromEntityInWorldCoords(ped, 0.0, 3.0, 0.0)
    local obj = CreateObject(hash, pos.x, pos.y, pos.z, false, false, false)

    if obj == 0 or not DoesEntityExist(obj) then
        say('FEHLER: CreateObject lieferte kein Objekt.')
        return
    end

    PlaceObjectOnGroundProperly(obj)
    FreezeEntityPosition(obj, true)
    spawned[#spawned + 1] = obj

    local mn, mx = GetModelDimensions(hash)
    say(('OK: Objekt erzeugt nach %d ms. Maße: %.2f x %.2f x %.2f'):format(waited, mx.x - mn.x, mx.y - mn.y, mx.z - mn.z))
    say('Jetzt prüfen: sichtbar? Textur? solide (dagegen laufen)? LOD-Wechsel (Abstand ändern)?')
    SetModelAsNoLongerNeeded(hash)
end, false)

RegisterCommand('propclear', function()
    for _, obj in ipairs(spawned) do
        if DoesEntityExist(obj) then DeleteEntity(obj) end
    end
    spawned = {}
    say('Alle Test-Objekte entfernt.')
end, false)
