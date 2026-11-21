-- All cabins referencing the same physical sensor share this server-owned table.
-- Only confirmed HTTP responses change registration; keypad drafts are local UI state.
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local Controller = {}
local vehicles, radios, started = {}, {}, false
local waitingLinks = {}
local rejectedRadios = {}
local api, sessionId, ready
local digits = { Zero = "0", One = "1", Two = "2", Three = "3", Four = "4",
	Five = "5", Six = "6", Seven = "7", Eight = "8", Nine = "9" }
-- Keep radio copy within the bitmap font's plain ASCII character set.
local plainCharacters = {
	["á"] = "a",
	["Á"] = "A",
	["ä"] = "a",
	["Ä"] = "A",
	["č"] = "c",
	["Č"] = "C",
	["ď"] = "d",
	["Ď"] = "D",
	["é"] = "e",
	["É"] = "E",
	["ě"] = "e",
	["Ě"] = "E",
	["í"] = "i",
	["Í"] = "I",
	["ĺ"] = "l",
	["Ĺ"] = "L",
	["ľ"] = "l",
	["Ľ"] = "L",
	["ň"] = "n",
	["Ň"] = "N",
	["ó"] = "o",
	["Ó"] = "O",
	["ô"] = "o",
	["Ô"] = "O",
	["ö"] = "o",
	["Ö"] = "O",
	["ŕ"] = "r",
	["Ŕ"] = "R",
	["ř"] = "r",
	["Ř"] = "R",
	["š"] = "s",
	["Š"] = "S",
	["ť"] = "t",
	["Ť"] = "T",
	["ú"] = "u",
	["Ú"] = "U",
	["ů"] = "u",
	["Ů"] = "U",
	["ü"] = "u",
	["Ü"] = "U",
	["ý"] = "y",
	["Ý"] = "Y",
	["ž"] = "z",
	["Ž"] = "Z",
	["·"] = "|", ["→"] = ">", ["…"] = "...",
}
local function radioText(value)
	local plain = string.gsub(value, "[\194-\244][\128-\191]*", function(character)
		return plainCharacters[character] or ""
	end)
	return plain
end

local function text(parent, path, value)
	local target = parent
	for segment in string.gmatch(path, "[^/]+") do
		target = target and target:FindFirstChild(segment)
	end
	if target and target:IsA("TextLabel") then target.Text = radioText(value) end
end
local function showScreen(gui, frameName)
-- Disabling SurfaceGui exposes the model's grey backing part. Keep an
-- opaque black UI surface when the LCD is off instead.
	gui.Enabled = true
	for _, frame in ipairs(gui:GetChildren()) do
		if frame:IsA("Frame") then frame.Visible = frame.Name == frameName end
	end
end
local function prepareDisplay(gui)
	local off = gui:FindFirstChild("JOPPoweredOff") or Instance.new("Frame", gui)
	off.Name = "JOPPoweredOff"
	off.Position, off.Size = UDim2.fromScale(0, 0), UDim2.fromScale(1, 1)
	off.BackgroundColor3, off.BackgroundTransparency = Color3.fromRGB(0, 0, 0), 0
	off.BorderSizePixel, off.ZIndex = 0, 20
	-- The supplied UI contains baked-in white selection backgrounds. Input is
	-- now one explicit value, so keep its ordinary text and headers transparent.
	local foreground = Color3.fromRGB(235, 235, 215)
	for _, object in ipairs(gui:GetDescendants()) do
		if object:IsA("TextLabel") then
			object.BackgroundTransparency = 1
			object.BorderSizePixel = 0
			object.TextColor3 = foreground
			object.Text = radioText(object.Text)
			if object.Name == "REGISTROVAN_text" or object.Name == "CELEJTE_text" then
				object.TextWrapped, object.TextScaled = true, true
			end
		end
	end
	for _, frame in ipairs(gui:GetChildren()) do
		for _, name in ipairs({ "TrainNumberFrame", "FunctionCode", "RadioChannel", "Registrated", "Mode" }) do
			local header = frame:FindFirstChild(name)
			if header and header:IsA("Frame") then header.BackgroundTransparency = 1 end
		end
	end
	local main = gui:FindFirstChild("MainScreen")
	local function positionMainText(name, y, height)
		local label = main and main:FindFirstChild(name)
		if not label or not label:IsA("TextLabel") then return end
		-- Keep status/errors and operation hints in separate body rows, clear of
		-- the header, right-hand call icons and bottom function-key artwork.
		label.Position, label.Size = UDim2.fromScale(0.09, y), UDim2.fromScale(0.67, height)
		label.TextScaled, label.TextWrapped, label.ClipsDescendants = true, true, true
		label.ZIndex = 10
	end
	positionMainText("REGISTROVAN_text", 0.34, 0.21)
	positionMainText("CELEJTE_text", 0.62, 0.12)
	local entering = gui:FindFirstChild("Registration_NumberEntering")
	if not entering then return end
	local source = entering:FindFirstChild("TrainNumberFrame")
	local reference = source and source:FindFirstChildOfClass("TextLabel")
	local function entryLabel(name, y, height)
		local label = entering:FindFirstChild(name) or Instance.new("TextLabel", entering)
		label.Name = name
		label.BackgroundTransparency, label.BorderSizePixel = 1, 0
		label.TextColor3 = foreground
		label.Position, label.Size = UDim2.fromScale(0.08, y), UDim2.fromScale(0.68, height)
		label.TextScaled, label.TextWrapped = true, true
		label.ClipsDescendants = true
		label.ZIndex = 10
		if reference then label.FontFace = reference.FontFace end
	end
	entryLabel("JOPEntryPrompt", 0.23, 0.18)
	entryLabel("JOPEntryValue", 0.44, 0.14)
	entryLabel("JOPEntryHelp", 0.62, 0.12)
end

local function render(vehicle)
	local communication = vehicle.communication or {}
	local call = type(communication.call) == "table" and communication.call or nil
	local emergency = type(communication.outgoingEmergency) == "table" and communication.outgoingEmergency or nil
	-- Occupation observers join this physical part to the confirmed radio UUID.
	-- Repair a missing/stale attribute on every synchronization, not only attach.
	if vehicle.sensor.Parent then vehicle.sensor:SetAttribute("JOPVehicleSensorId", vehicle.sensorId) end
	local binding = vehicle.confirmed and vehicle.confirmed.binding
	if type(binding) ~= "table" then binding = nil end
	if vehicle.sensor.Parent then vehicle.sensor:SetAttribute("JOPGsmRTrainNumber", binding and binding.trainNumber or nil) end
	if vehicle.sensor.Parent then vehicle.sensor:SetAttribute("JOPGsmRDriverId", binding and binding.driverId or nil) end
	if vehicle.sensor.Parent then vehicle.sensor:SetAttribute("JOPGsmRDriverCallsign", binding and binding.driverCallsign or nil) end
	if vehicle.sensor.Parent then vehicle.sensor:SetAttribute("JOPGsmRTimetableId", binding and binding.timetableId or nil) end
	if vehicle.sensor.Parent then vehicle.sensor:SetAttribute("JOPGsmRFunctionCode", binding and binding.functionCode or nil) end
	for radio in pairs(vehicle.radios) do
		local part = radio:FindFirstChild("Part")
		local gui = part and part:FindFirstChild("SurfaceGui")
		if not gui then continue end
		local screen = vehicle.screen
		local frameName = screen == "startup" and "StartUp"
		or (screen == "driver" or screen == "train" or screen == "dial") and "Registration_NumberEntering"
		or screen == "hv" and "Registration_HVselection" or "MainScreen"
		showScreen(gui, vehicle.powered and frameName or "JOPPoweredOff")
		for _, frame in ipairs(gui:GetChildren()) do
			if frame:IsA("Frame") then
				text(frame, "TrainNumberFrame/TextLabel", vehicle.trainNumber)
				text(frame, "FunctionCode/TextLabel", vehicle.functionCode)
				text(frame, "RadioChannel/TextLabel", communication.zone or "--")
				text(frame, "Registrated/TextLabel", binding and "R" or "")
				text(frame, "Mode/TextLabel", "GSM-R")
			end
		end
		local entering = gui:FindFirstChild("Registration_NumberEntering")
		if entering then
			text(entering, "JOPEntryPrompt", screen == "driver" and "VOLACI ZNAK\nRUSNOVODICA" or screen == "dial" and "VOLANE CISLO" or "CISLO VLAKU")
			text(entering, "JOPEntryValue", vehicle.entry .. "_")
			text(entering, "JOPEntryHelp", screen == "driver"
			and "3 CISLICE Z DIS\n* POTVRDIT | DEL ZMAZAT"
			or screen == "dial" and "1300: VYPRAVCA\n* VOLAT | NULL SPAT"
			or "CISLO Z GVD\n* POTVRDIT | DEL ZMAZAT")
		end
		local main = gui:FindFirstChild("MainScreen")
		if main then
			text(main, "TrainNumberFrame/TrainNumber", binding and binding.trainNumber or vehicle.trainNumber)
			text(main, "TrainNumberFrame/TrainNumber2", binding and ("VL" .. binding.trainNumber .. " STR" .. tonumber(binding.functionCode)) or "")
			local status = binding and "REGISTROVANY" or "NEREGISTROVANY"
			if call then status = (call.phase == "connected" and "HOVOR: " or call.incoming and "PRICHADZA HOVOR: " or "VOLAM: ") .. (call.contact and call.contact.name or "") end
			if emergency then status = "TIESNOVE VYSIELANIE" end
			if (communication.incomingEmergencies or 0) > 0 then status ..= " | PRIJEM TIESNE: " .. communication.incomingEmergencies end
			text(main, "REGISTROVAN_text", vehicle.message ~= "" and vehicle.message or (communication.notice or "") ~= "" and communication.notice or status)
			text(main, "CELEJTE_text", vehicle.busy and "CAKAJTE" or emergency and "F6 / NULL: KONIEC TIESNE"
			or call and (call.incoming and call.phase == "ringing" and "*: ZDVIHNUT SLUCHADLO\nF6 / NULL: ODMIETNUT" or "F6 / NULL: ZAVESIT")
			or binding and "F8: VYPRAVCA | F1: CISLO" or "")
			text(main, "GSMRcountry", vehicle.prefix and "F: F8 funkcia / F9 vlak" or "GSM-R SK")
			local icons = main:FindFirstChild("Icons")
			if icons then
				for _, icon in ipairs(icons:GetChildren()) do
					if icon:IsA("ImageLabel") then
						icon.Visible = icon.Name == "deregestration" and binding ~= nil
						or icon.Name == "regrestration" and binding == nil
						or icon.Name == "CallDispatcher"
						or icon.Name == "CallTrafficDispatcher"
						or icon.Name == "CallElectricalDispatcher"
						or icon.Name == "GroupCall" and (emergency ~= nil or (communication.incomingEmergencies or 0) > 0)
					end
				end
			end
			local arrow = main:FindFirstChild("DeregistrationArrow")
			if arrow then arrow.Visible = binding ~= nil end
		end
		radio:SetAttribute("JOPGsmRStatus", vehicle.busy and "pending" or binding and "registered" or "unregistered")
		radio:SetAttribute("JOPVehicleSensorId", vehicle.sensorId)
	end
end
local function apply(vehicle, confirmed)
	if not confirmed or (vehicle.confirmed and confirmed.revision < vehicle.confirmed.revision) then return end
	vehicle.confirmed = confirmed
	if type(confirmed.communication) == "table" then
		local communication = confirmed.communication
		local call = type(communication.call) == "table" and communication.call or {}
		local emergency = type(communication.outgoingEmergency) == "table" and communication.outgoingEmergency or {}
		local signature = table.concat({ communication.zone or "--", tostring(communication.browserConnected), call.id or "", call.phase or "", emergency.id or "", tostring(communication.incomingEmergencies or 0), communication.notice or "" }, ":")
		if signature ~= vehicle.communicationSignature then
			vehicle.message = ""
			local previousCall = (vehicle.communication or {}).call
			if call.incoming and call.phase == "ringing" and (type(previousCall) ~= "table" or previousCall.id ~= call.id) then
				vehicle.screen, vehicle.entry, vehicle.prefix = "main", "", false
			end
		end
		vehicle.communication, vehicle.communicationSignature = communication, signature
	end
	local binding = confirmed.binding
	if type(binding) == "table" then
		vehicle.trainNumber, vehicle.driverId, vehicle.functionCode = binding.trainNumber, binding.driverCallsign or "", binding.functionCode
	end
end
local function reconcile(vehicle)
	local result = api:GsmR(sessionId)
	if result.error then return false end
	for _, confirmed in ipairs(result.vehicles or {}) do
		if confirmed.sensorId == vehicle.sensorId then apply(vehicle, confirmed); return true end
	end
	return false
end
local function release(vehicle)
	local binding = vehicle.confirmed and vehicle.confirmed.binding
	if type(binding) ~= "table" then vehicle.releaseRequested = false; return end
	local result = api:GsmR(sessionId, { type = "deregister", sensorId = vehicle.sensorId,
		actorUserId = binding.driverId, expectedRevision = vehicle.confirmed.revision })
	if result.vehicle then
		apply(vehicle, result.vehicle)
		vehicle.releaseRequested = false
		vehicle.driverId, vehicle.owner = "", nil
	end
	render(vehicle)
end
local function command(vehicle, player, deregister)
	if not ready or not ready() then vehicle.message = "JOP sa pripája. Skúste znova."; return end
	if not vehicle.confirmed or vehicle.uncertain then
		vehicle.message = "Overuje sa spojenie. Skúste znova."
		return
	end
	vehicle.busy, vehicle.screen, vehicle.message = true, "main", ""
	render(vehicle)
	local payload = { type = deregister and "deregister" or "register", sensorId = vehicle.sensorId,
		actorUserId = tostring(player.UserId), expectedRevision = vehicle.confirmed.revision }
	if not deregister then
		payload.driverId, payload.trainNumber, payload.functionCode = vehicle.driverId, vehicle.trainNumber, vehicle.functionCode
	end
	local result = api:GsmR(sessionId, payload)
	if result.vehicle then apply(vehicle, result.vehicle) end
	if result.error then
		vehicle.message = result.error
		-- A lost reply can mean the write succeeded. Reconcile before allowing
		-- another operation, including Power/End or an opposite command.
		vehicle.uncertain = not reconcile(vehicle)
	else
		vehicle.uncertain = false
	end
	vehicle.busy = false
	if player.Parent ~= Players or not vehicle.sensor:IsDescendantOf(workspace) then vehicle.releaseRequested = true end
	if deregister and not result.error then
		vehicle.driverId, vehicle.owner = "", nil
	end
	render(vehicle)
end
local function radioAction(vehicle, player, action)
	if not ready or not ready() or not vehicle.confirmed or type(vehicle.confirmed.binding) ~= "table" then
		vehicle.message = "NAJPRV ZAREGISTRUJTE RADIO"; return
	end
	vehicle.busy = true
	render(vehicle)
	-- Reuse this ID across HTTP retries: one press must never create two calls.
	local result = api:GsmR(sessionId, { type = "radio-action", sensorId = vehicle.sensorId,
		actorUserId = tostring(player.UserId), action = action, commandId = HttpService:GenerateGUID(false) })
	vehicle.busy = false
	vehicle.message = result.error or ""
end
local function press(vehicle, radio, button, player)
	if not player or player.Parent ~= Players or vehicle.busy or vehicle.releaseRequested then return end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	if not root or (root.Position - button.Position).Magnitude > 12 then return end
	local now = os.clock()
	if now - (vehicle.lastPress or 0) < 0.08 then return end
	vehicle.lastPress = now
	local binding = vehicle.confirmed and vehicle.confirmed.binding
	if type(binding) == "table" and binding.driverId ~= tostring(player.UserId) then return end
	if vehicle.owner and vehicle.owner ~= player.UserId and now < vehicle.ownerUntil then return end
	if vehicle.owner ~= player.UserId then
		vehicle.entry, vehicle.prefix, vehicle.screen = "", false, "main"
		vehicle.driverId = type(binding) == "table" and (binding.driverCallsign or "") or ""
	end
	vehicle.owner, vehicle.ownerUntil = player.UserId, now + 60
	local name = button.Name
	if name == "StarEnter" then name = "Enter" end
	if name == "Null" or name == "NULL" then name = "End" end
	vehicle.message = ""
	if name == "Power" then
		if vehicle.uncertain then vehicle.message = "Najprv obnovte spojenie s JOP."
		elseif type(binding) == "table" then
			vehicle.message = "Najprv zrušte registráciu tlačidlom F4."
		else
			vehicle.powered = not vehicle.powered
			vehicle.screen = vehicle.powered and "startup" or "main"
			if vehicle.powered then
				task.delay(3, function()
					if vehicle.screen == "startup" then vehicle.screen = "main"; render(vehicle) end
				end)
			end
		end
	elseif not vehicle.powered or vehicle.screen == "startup" then return
	elseif name == "RadioStop" then
		local communication = vehicle.communication or {}
		if type(communication.outgoingEmergency) == "table" then
			vehicle.prefix = false
			vehicle.message = "VYSIELATE. F6 / NULL: UKONCIT TIESEN"
		else
			local action = vehicle.prefix and "emergency-station" or "emergency-session"
			vehicle.screen, vehicle.entry, vehicle.prefix = "main", "", false
			radioAction(vehicle, player, action)
		end
	elseif vehicle.screen == "main" and name == "F8" and not vehicle.prefix then
		radioAction(vehicle, player, "call-dispatcher")
	elseif vehicle.screen == "main" and name == "F9" and not vehicle.prefix then
		vehicle.message = "DOPRAVNY DISPECER NEDOSTUPNY. F8: VYPRAVCA"
	elseif vehicle.screen == "main" and name == "F7" and not vehicle.prefix then
		vehicle.message = "ELEKTRODISPECER NEDOSTUPNY. F8: VYPRAVCA"
	elseif vehicle.screen == "main" and name == "F1" and not vehicle.prefix then
		local communication = vehicle.communication or {}
		if type(binding) ~= "table" then vehicle.message = "NAJPRV ZAREGISTRUJTE RADIO"
		elseif type(communication.call) == "table" or type(communication.outgoingEmergency) == "table" then
			vehicle.message = "NAJPRV UKONCITE HOVOR: F6 / NULL"
		else vehicle.screen, vehicle.entry = "dial", "" end
	elseif vehicle.screen == "main" and name == "Enter" and type((vehicle.communication or {}).call) == "table" then
		local call = vehicle.communication.call
		-- There is no modelled handset: * explicitly simulates lifting it.
		if call.incoming and call.phase == "ringing" then radioAction(vehicle, player, "answer")
		else vehicle.message = "F6 / NULL: ZAVESIT" end
	elseif name == "End" or (vehicle.screen == "main" and name == "F6" and not vehicle.prefix) then
		local communication = vehicle.communication or {}
		if vehicle.screen == "main" and type(communication.outgoingEmergency) == "table" then radioAction(vehicle, player, "emergency-stop")
		elseif vehicle.screen == "main" and type(communication.call) == "table" then radioAction(vehicle, player, "hangup") end
		vehicle.screen, vehicle.entry, vehicle.prefix = "main", "", false
	elseif name == "F" then vehicle.prefix = not vehicle.prefix
	elseif name == "F4" and not vehicle.prefix and vehicle.screen == "main" then
		if type(binding) == "table" then command(vehicle, player, true) end
	elseif (name == "F3" and vehicle.screen == "main") or (vehicle.prefix and name == "F9") then
		vehicle.prefix = false
		if type(binding) == "table" then vehicle.message = "Najprv zrušte registráciu tlačidlom F4."
		else vehicle.screen, vehicle.entry = "driver", "" end
	elseif vehicle.prefix and name == "F8" then
		vehicle.prefix = false
		if not binding then vehicle.screen = "hv" end
	elseif vehicle.screen == "hv" then
		local index = tonumber(string.match(name, "^F([1-5])$")) or tonumber(digits[name])
		if index and index >= 1 and index <= 5 then
			vehicle.functionCode, vehicle.screen = string.format("%02d", index), "main"
			vehicle.message = "ENTER: potvrdiť registráciu"
		end
	elseif vehicle.screen == "dial" then
		local digit = digits[name]
		if digit and #vehicle.entry < 12 then vehicle.entry ..= digit
		elseif name == "Delete" then vehicle.entry = string.sub(vehicle.entry, 1, -2)
		elseif name == "Enter" then
			if vehicle.entry == "1300" then
				vehicle.screen, vehicle.entry = "main", ""
				radioAction(vehicle, player, "call-dispatcher")
			else
				vehicle.screen, vehicle.entry = "main", ""
				vehicle.message = "CISLO NEDOSTUPNE. F8 ALEBO 1300: VYPRAVCA"
			end
		end
	elseif vehicle.screen == "driver" or vehicle.screen == "train" then
		local digit = digits[name]
		if digit then
			vehicle.prefix = false
			if #vehicle.entry < (vehicle.screen == "driver" and 3 or 6) then vehicle.entry ..= digit end
		elseif name == "Delete" then vehicle.entry = string.sub(vehicle.entry, 1, -2)
		elseif name == "Enter" then
			if vehicle.screen == "driver" then
				if #vehicle.entry ~= 3 or vehicle.entry == "000" then
					vehicle.screen, vehicle.message = "main", "Zadajte 3 číslice volacieho znaku z DIS."
				else vehicle.driverId, vehicle.screen, vehicle.entry = vehicle.entry, "train", "" end
			elseif #vehicle.entry > 0 then
				vehicle.trainNumber = vehicle.entry
				vehicle.screen = "hv"
			end
		end
	elseif name == "Enter" and type(binding) == "table" then
		vehicle.message = type((vehicle.communication or {}).outgoingEmergency) == "table"
		and "F6 / NULL: KONIEC TIESNE" or "F8: VYPRAVCA | F1: CISLO"
	elseif name == "Enter" and vehicle.driverId ~= "" and vehicle.trainNumber ~= "" then
		command(vehicle, player, false)
	elseif name == "Simplex" or name == "System" or string.match(name, "^F%d$") then
		vehicle.message = "Táto funkcia zatiaľ nie je dostupná."
	end
	render(vehicle)
end
function Controller.Attach(radio)
	if radios[radio] or rejectedRadios[radio] or not radio:IsDescendantOf(workspace) then return end
	local buttons = radio:FindFirstChild("Buttons")
	local part = radio:FindFirstChild("Part")
	if not buttons or not part or not part:FindFirstChild("SurfaceGui") then return end
	local link = radio:FindFirstChild("VehicleSensorLink")
	if link and link:IsA("ObjectValue") and not link.Value and not waitingLinks[link] then
		local changed, destroyed
		local function stopWaiting()
			changed:Disconnect(); destroyed:Disconnect(); waitingLinks[link] = nil
		end
		changed = link:GetPropertyChangedSignal("Value"):Connect(function()
			if link.Value then stopWaiting(); Controller.Attach(radio) end
		end)
		destroyed = link.Destroying:Connect(stopWaiting)
		waitingLinks[link] = true
	end
	local sensor = link and link:IsA("ObjectValue") and link.Value
	if not sensor or not sensor:IsA("BasePart") or not sensor:IsDescendantOf(workspace)
	or not string.find(string.lower(sensor.Name), "vehiclesensor", 1, true) then
		warn("[JOP][GSM-R] Invalid VehicleSensorLink: " .. radio:GetFullName()); return
	end
	local vehicle = vehicles[sensor]
	if not vehicle then
		vehicle = { sensor = sensor, sensorId = HttpService:GenerateGUID(false), radios = {},
			powered = false, screen = "main", entry = "", trainNumber = "", driverId = "",
			functionCode = "01", message = "", prefix = false, busy = false }
		sensor:SetAttribute("JOPVehicleSensorId", vehicle.sensorId)
		vehicles[sensor] = vehicle
		sensor.Destroying:Connect(function() vehicle.releaseRequested = true end)
	end
	prepareDisplay(part:FindFirstChild("SurfaceGui"))
	vehicle.radios[radio], radios[radio] = true, vehicle
	local connections = {}
	if buttons then
		for _, button in ipairs(buttons:GetChildren()) do
			if button:IsA("BasePart") and button.Name ~= "SmallGrayButton" then
				local Click = require(game.ServerScriptService:WaitForChild("RailKit750").Modules.CustomClickDetector)
				local detector = Click.new(button)
				table.insert(connections, detector.MouseClick:Connect(function(player) press(vehicle, radio, button, player) end))
			end
		end
	end
	-- Never silently transfer an existing registration when an ObjectValue is edited.
	table.insert(connections, link:GetPropertyChangedSignal("Value"):Connect(function()
		rejectedRadios[radio] = true
		warn("[JOP][GSM-R] VehicleSensorLink changed; restore it or restart the server: " .. radio:GetFullName())
		for _, connection in ipairs(connections) do connection:Disconnect() end
		local gui = radio:FindFirstChild("Part") and radio.Part:FindFirstChild("SurfaceGui")
		if gui then showScreen(gui, "JOPPoweredOff") end
		vehicle.radios[radio], radios[radio] = nil, nil
		if not next(vehicle.radios) then vehicle.releaseRequested = true end
	end))
	table.insert(connections, radio.Destroying:Connect(function()
		for _, connection in ipairs(connections) do connection:Disconnect() end
		vehicle.radios[radio], radios[radio] = nil, nil
		if not next(vehicle.radios) then vehicle.releaseRequested = true end
	end))
	render(vehicle)
end
function Controller.Start(client, id, isReady)
	if started then return end
	started, api, sessionId, ready = true, client, id, isReady
	local function discover(instance)
		local radio = instance
		while radio and radio ~= workspace do
			if radio:IsA("Model") and radio.Name == "RadioStation" then
				Controller.Attach(radio)
				return
			end
			radio = radio.Parent
		end
	end
	for _, instance in ipairs(workspace:GetDescendants()) do discover(instance) end
	workspace.DescendantAdded:Connect(discover)
	Players.PlayerRemoving:Connect(function(player)
		for _, vehicle in pairs(vehicles) do
			local binding = vehicle.confirmed and vehicle.confirmed.binding
			if type(binding) == "table" and binding.driverId == tostring(player.UserId) then
				vehicle.releaseRequested = true
			elseif vehicle.owner == player.UserId then
				vehicle.releaseRequested = vehicle.busy
				vehicle.owner, vehicle.driverId, vehicle.entry, vehicle.screen = nil, "", "", "main"
				render(vehicle)
			end
		end
	end)
	task.spawn(function()
		while true do
			if ready() then
				local missing = {}
				for _, vehicle in pairs(vehicles) do
					if not vehicle.confirmed and next(vehicle.radios) then table.insert(missing, vehicle.sensorId) end
				end
				-- Avoid an inventory request per cabin or per vehicle.
				for offset = 1, #missing, 500 do
					local batch = {}
					for index = offset, math.min(offset + 499, #missing) do table.insert(batch, missing[index]) end
					api:GsmR(sessionId, { type = "initialize", sensorIds = batch })
				end
				local result = api:GsmR(sessionId)
				if not result.error then
					for _, confirmed in ipairs(result.vehicles or {}) do
						for _, vehicle in pairs(vehicles) do
							if vehicle.sensorId == confirmed.sensorId and not vehicle.busy then
								apply(vehicle, confirmed); vehicle.uncertain = false; render(vehicle)
							end
						end
					end
				end
				for sensor, vehicle in pairs(vehicles) do
					if vehicle.releaseRequested and not vehicle.busy then
						vehicle.busy = true
						release(vehicle)
						vehicle.busy = false
						render(vehicle)
					end
					if not next(vehicle.radios) and not vehicle.busy and not vehicle.releaseRequested then
						vehicles[sensor] = nil
					end
				end
			end
			task.wait(1)
		end
	end)
end
return Controller
