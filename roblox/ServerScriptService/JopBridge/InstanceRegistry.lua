local HttpService = game:GetService("HttpService")

local InstanceRegistry = {}
InstanceRegistry.__index = InstanceRegistry

local function normalizeStationId(value)
	if type(value) ~= "string" then
		return nil
	end

	local trimmed = string.match(value, "^%s*(.-)%s*$")
	if not trimmed or trimmed == "" then
		return nil
	end

	return string.lower(trimmed)
end

local function decodeLinks(instance, attributeName)
	local encoded = instance:GetAttribute(attributeName)
	if type(encoded) ~= "string" or encoded == "" then
		return nil
	end

	local success, links = pcall(function()
		return HttpService:JSONDecode(encoded)
	end)
	if not success or type(links) ~= "table" then
		warn(string.format("[JOP] Invalid %s JSON on %s", attributeName, instance:GetFullName()))
		return nil
	end

	local valid = {}
	for _, link in ipairs(links) do
		if type(link) == "table" and type(link.stationId) == "string" and type(link.pieceId) == "string" then
			local stationId = normalizeStationId(link.stationId)
			if not stationId then
				continue
			end

			local entry = { stationId = stationId, pieceId = link.pieceId }
			if type(link.traversalState) == "string" and link.traversalState ~= "" then
				entry.traversalState = link.traversalState
			end
			table.insert(valid, entry)
		end
	end
	return #valid > 0 and valid or nil
end

function InstanceRegistry.new(config, hardwareDriver, onOccupation, onSwitchFeedback)
	local self = setmetatable({}, InstanceRegistry)
	self._attributeName = config.LinkAttributeName
	self._driver = hardwareDriver
	self._onOccupation = onOccupation
	self._onSwitchFeedback = onSwitchFeedback
	self._entries = {}
	self._connections = {}
	self._attributeConnections = {}
	self._statesByKey = {}
	self._instancesByPieceKey = {}
	return self
end

local function formatLink(link)
	if type(link.traversalState) == "string" and link.traversalState ~= "" then
		return string.format(
			"{stationId=%s, pieceId=%s, traversalState=%s}",
			link.stationId,
			link.pieceId,
			link.traversalState
		)
	end

	return string.format("{stationId=%s, pieceId=%s}", link.stationId, link.pieceId)
end

local function mergeOccupationReport(link, report)
	if type(report) ~= "table" then
		return report
	end

	local merged = {}
	for key, value in pairs(report) do
		merged[key] = value
	end

	if merged.traversalState == nil and type(link.traversalState) == "string" then
		merged.traversalState = link.traversalState
	end

	return merged
end

local function formatUpdateSummary(state)
	if type(state) ~= "table" then
		return "unknown"
	end

	if state.resolvedSignalAspect ~= nil or state.resolvedSignalFamily ~= nil then
		return string.format(
			"signal family=%s aspect=%s",
			tostring(state.resolvedSignalFamily),
			tostring(state.resolvedSignalAspect)
		)
	end

	if type(state.switchAlignment) == "table" then
		local fragments = {}
		local motorPositions = state.switchAlignment.motorPositions
		if type(motorPositions) == "table" then
			for _, slot in ipairs({ "main", "upper", "lower" }) do
				if motorPositions[slot] ~= nil then
					table.insert(fragments, string.format("%s=%s", slot, tostring(motorPositions[slot])))
				end
			end
		end
		return string.format(
			"switch state=%s motors=[%s]",
			tostring(state.switchAlignment.traversableState),
			#fragments > 0 and table.concat(fragments, ", ") or "none"
		)
	end

	if type(state.groups) == "table" and type(state.groups.occupation) == "table" then
		return string.format(
			"occupation state=%s variant=%s",
			tostring(state.groups.occupation.state),
			tostring(state.groups.occupation.variant)
		)
	end

	return tostring(state.pieceType or "piece")
end

function InstanceRegistry:_applyEntry(instance, entry)
	local linkedStates = {}
	for _, link in ipairs(entry.links) do
		local state = self._statesByKey[link.stationId .. "\0" .. link.pieceId]
		if state then
			table.insert(linkedStates, state)
		end
	end
	if #linkedStates > 0 then
		self._driver.ApplyInstanceState(instance, linkedStates, entry.capabilities)
	end
end

function InstanceRegistry:_linkEntryToPieceKeys(instance, entry)
	for _, link in ipairs(entry.links) do
		local pieceKey = link.stationId .. "\0" .. link.pieceId
		local instances = self._instancesByPieceKey[pieceKey]
		if not instances then
			instances = {}
			self._instancesByPieceKey[pieceKey] = instances
		end
		instances[instance] = true
	end
end

function InstanceRegistry:_unlinkEntryFromPieceKeys(instance, entry)
	for _, link in ipairs(entry.links) do
		local pieceKey = link.stationId .. "\0" .. link.pieceId
		local instances = self._instancesByPieceKey[pieceKey]
		if instances then
			instances[instance] = nil
			if next(instances) == nil then
				self._instancesByPieceKey[pieceKey] = nil
			end
		end
	end
end

function InstanceRegistry:_remove(instance)
	local entry = self._entries[instance]
	if not entry then
		return
	end
	entry.disconnectOccupation()
	entry.disconnectSwitchFeedback()
	self:_unlinkEntryFromPieceKeys(instance, entry)
	self._entries[instance] = nil
end

function InstanceRegistry:_refresh(instance)
	self:_remove(instance)
	local links = decodeLinks(instance, self._attributeName)
	if not links then
		return
	end
	local capabilities = self._driver.DescribeInstance and self._driver.DescribeInstance(instance) or nil

	local disconnectOccupation = self._driver.ObserveOccupation(instance, function(report)
		for _, link in ipairs(links) do
			self._onOccupation(link, mergeOccupationReport(link, report))
		end
	end, capabilities)
	local disconnectSwitchFeedback = self._driver.ObserveSwitchFeedback(instance, function(report)
		for _, link in ipairs(links) do
			self._onSwitchFeedback(link, report)
		end
	end, capabilities)

	self._entries[instance] = {
		links = links,
		capabilities = capabilities,
		disconnectOccupation = disconnectOccupation,
		disconnectSwitchFeedback = disconnectSwitchFeedback,
	}
	self:_linkEntryToPieceKeys(instance, self._entries[instance])
	self:_applyEntry(instance, self._entries[instance])
end

function InstanceRegistry:_watch(instance)
	if self._attributeConnections[instance] then
		return
	end
	self._attributeConnections[instance] = instance:GetAttributeChangedSignal(self._attributeName):Connect(function()
		self:_refresh(instance)
	end)
	self:_refresh(instance)
end

function InstanceRegistry:Start()
	for _, instance in ipairs(game:GetDescendants()) do
		self:_watch(instance)
	end
	table.insert(self._connections, game.DescendantAdded:Connect(function(instance)
		self:_watch(instance)
	end))
	table.insert(self._connections, game.DescendantRemoving:Connect(function(instance)
		self:_remove(instance)
		local connection = self._attributeConnections[instance]
		if connection then
			connection:Disconnect()
			self._attributeConnections[instance] = nil
		end
	end))
end

function InstanceRegistry:DebugPrintLinks()
	print("[JOP] Linked Roblox instances discovered:")

	local printedAny = false
	for instance, entry in pairs(self._entries) do
		printedAny = true
		local linkStrings = {}
		for _, link in ipairs(entry.links) do
			table.insert(linkStrings, formatLink(link))
		end
		print(string.format("[JOP] %s -> %s", instance:GetFullName(), table.concat(linkStrings, ", ")))
	end

	if not printedAny then
		print("[JOP] No linked Roblox instances were found.")
	end
end

function InstanceRegistry:ApplySnapshot(snapshot)
	print(
		string.format(
			"[JOP][Registry] Applying snapshot for session %s with %d stations",
			tostring(snapshot.sessionId),
			type(snapshot.stations) == "table" and #snapshot.stations or 0
		)
	)
	self._statesByKey = {}
	for _, station in ipairs(snapshot.stations) do
		local stationId = normalizeStationId(station.stationId)
		for pieceId, piece in pairs(station.pieces) do
			if stationId then
				self._statesByKey[stationId .. "\0" .. pieceId] = {
					stationId = stationId,
				pieceId = pieceId,
				pieceType = piece.type,
				groups = piece.groups,
				texts = piece.texts,
				switchAlignment = piece.switchAlignment,
				resolvedSignalFamily = piece.resolvedSignalFamily,
				resolvedSignalAspect = piece.resolvedSignalAspect,
			}
				print(
					string.format(
						"[JOP][Registry] - Snapshot %s/%s -> %s",
						stationId,
						tostring(pieceId),
						formatUpdateSummary(self._statesByKey[stationId .. "\0" .. pieceId])
					)
				)
			end
		end
	end

	for instance, entry in pairs(self._entries) do
		self:_applyEntry(instance, entry)
	end
end

function InstanceRegistry:ApplyUpdates(updateBatch)
	if type(updateBatch) ~= "table" or type(updateBatch.updates) ~= "table" then
		return
	end

	print(
		string.format(
			"[JOP][Registry] Applying queued updates cursor=%s count=%d",
			tostring(updateBatch.cursor),
			#updateBatch.updates
		)
	)

	local touchedInstances = {}

	for _, update in ipairs(updateBatch.updates) do
		local stationId = normalizeStationId(update.stationId)
		if not stationId then
			continue
		end

		local pieceKey = stationId .. "\0" .. update.pieceId
		self._statesByKey[pieceKey] = {
			stationId = stationId,
			pieceId = update.pieceId,
			pieceType = update.piece.type,
			groups = update.piece.groups,
			texts = update.piece.texts,
			switchAlignment = update.piece.switchAlignment,
			resolvedSignalFamily = update.piece.resolvedSignalFamily,
			resolvedSignalAspect = update.piece.resolvedSignalAspect,
		}
		print(
			string.format(
				"[JOP][Registry] - Update %s/%s -> %s",
				stationId,
				tostring(update.pieceId),
				formatUpdateSummary(self._statesByKey[pieceKey])
			)
		)

		local instances = self._instancesByPieceKey[pieceKey]
		if instances then
			for instance, _ in pairs(instances) do
				touchedInstances[instance] = true
			end
		end
	end

	for instance, _ in pairs(touchedInstances) do
		local entry = self._entries[instance]
		if entry then
			self:_applyEntry(instance, entry)
		end
	end
end

return InstanceRegistry
