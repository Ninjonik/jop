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
local function text(parent, path, value)
	local target = parent
	for segment in string.gmatch(path, "[^/]+") do
		target = target and target:FindFirstChild(segment)
	end
	if target and target:IsA("TextLabel") then target.Text = value end
end
local function render(vehicle)
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
			or (screen == "driver" or screen == "train") and "Registration_NumberEntering"
			or screen == "hv" and "Registration_HVselection" or "MainScreen"
		gui.Enabled = vehicle.powered
		for _, frame in ipairs(gui:GetChildren()) do
			if frame:IsA("Frame") then
				frame.Visible = frame.Name == frameName
				text(frame, "TrainNumberFrame/TextLabel", screen == "driver" and vehicle.entry
					or screen == "train" and vehicle.entry or vehicle.trainNumber)
				text(frame, "FunctionCode/TextLabel", vehicle.functionCode)
				text(frame, "Registrated/TextLabel", binding and "R" or "")
				text(frame, "Mode/TextLabel", screen == "driver" and "VOLACÍ ZNAK" or "GSM-R")
			end
		end
		local main = gui:FindFirstChild("MainScreen")
		if main then
			text(main, "TrainNumberFrame/TrainNumber", binding and binding.trainNumber or vehicle.trainNumber)
			text(main, "TrainNumberFrame/TrainNumber2", binding and ("VL" .. binding.trainNumber .. " STR" .. tonumber(binding.functionCode)) or "")
			text(main, "REGISTROVAN_text", vehicle.message ~= "" and vehicle.message or binding and "REGISTROVANÝ" or "NEREGISTROVANÝ")
			text(main, "CELEJTE_text", vehicle.busy and "ČAKAJTE" or "")
			text(main, "GSMRcountry", vehicle.prefix and "F: F8 funkcia / F9 vlak" or "GSM-R SK")
			local icons = main:FindFirstChild("Icons")
			if icons then
				for _, icon in ipairs(icons:GetChildren()) do
					if icon:IsA("ImageLabel") then
						icon.Visible = icon.Name == "deregestration" and binding ~= nil
							or icon.Name == "regrestration" and binding == nil
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
	elseif name == "End" then vehicle.screen, vehicle.entry, vehicle.prefix = "main", "", false
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
	elseif name == "Enter" and vehicle.driverId ~= "" and vehicle.trainNumber ~= "" then
		command(vehicle, player, false)
	elseif name == "RadioStop" or name == "Simplex" or name == "System" or string.match(name, "^F%d$") then
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
		vehicles[sensor] = vehicle
		sensor.Destroying:Connect(function() vehicle.releaseRequested = true end)
	end
	vehicle.radios[radio], radios[radio] = true, vehicle
	local connections = {}
	if buttons then
		for _, button in ipairs(buttons:GetChildren()) do
			if button:IsA("BasePart") and button.Name ~= "SmallGrayButton" then
				local detector = button:FindFirstChildOfClass("ClickDetector") or Instance.new("ClickDetector")
				detector.MaxActivationDistance, detector.Parent = 12, button
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
		if gui then gui.Enabled = false end
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
			task.wait(10)
		end
	end)
end
return Controller
