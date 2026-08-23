local HttpService = game:GetService("HttpService")

local InstanceRegistry = {}
InstanceRegistry.__index = InstanceRegistry

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
			local entry = { stationId = link.stationId, pieceId = link.pieceId }
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
	return self
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

function InstanceRegistry:_remove(instance)
	local entry = self._entries[instance]
	if not entry then
		return
	end
	entry.disconnectOccupation()
	entry.disconnectSwitchFeedback()
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

function InstanceRegistry:ApplySnapshot(snapshot)
	self._statesByKey = {}
	for _, station in ipairs(snapshot.stations) do
		for pieceId, piece in pairs(station.pieces) do
			self._statesByKey[station.stationId .. "\0" .. pieceId] = {
				stationId = station.stationId,
				pieceId = pieceId,
				pieceType = piece.type,
				groups = piece.groups,
				texts = piece.texts,
				switchAlignment = piece.switchAlignment,
			}
		end
	end

	for instance, entry in pairs(self._entries) do
		self:_applyEntry(instance, entry)
	end
end

return InstanceRegistry
