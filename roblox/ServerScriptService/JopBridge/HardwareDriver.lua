-- This is the only module that should know the eventual in-game model structure.
-- Keep the bridge and web protocol unchanged when the physical implementation is added.

local HardwareDriver = {}
local SignalController = require(script.Parent.SignalController)
local PhysicsService = game:GetService("PhysicsService")

local COMPONENT_TYPE_ATTRIBUTE = "JOPComponentType"
local OCCUPIED_ATTRIBUTE = "JOPOccupied"
local TRAVERSAL_STATE_ATTRIBUTE = "JOPTraversalState"
local CONTROL_SLOT_ATTRIBUTE = "JOPControlSlot"
local POSITION_ATTRIBUTE = "JOPPosition"
local SIGNAL_STATE_ATTRIBUTE = "JOPResolvedSignalState"
local SIGNAL_PIECE_ID_ATTRIBUTE = "JOPResolvedSignalPieceId"
local SIGNAL_TEXT_ATTRIBUTE = "JOPResolvedSignalText"
local SWITCH_STATE_ATTRIBUTE = "JOPResolvedSwitchState"
local SWITCH_PIECE_ID_ATTRIBUTE = "JOPResolvedSwitchPieceId"

local SIGNAL_COMPONENT_TYPES = {
	signal = true,
	signalHead = true,
}

local SWITCH_COMPONENT_TYPES = {
	switch = true,
	switchMotor = true,
	switchFeedback = true,
}

local COUNTERS_GROUP_NAME = "Counters"
local OCCUPANCY_POLL_SECONDS = 2.5
local OCCUPANCY_INFLATION = Vector3.new(1, 1, 1)

local switchVisualStateByInstance = setmetatable({}, { __mode = "k" })

local function push(target, value)
	target[#target + 1] = value
end

local function ensureCountersCollisionGroup()
	local groupId = PhysicsService:GetCollisionGroupId(COUNTERS_GROUP_NAME)
	if groupId == -1 then
		warn("[JOP] Creating missing collision group: " .. COUNTERS_GROUP_NAME)
		PhysicsService:CreateCollisionGroup(COUNTERS_GROUP_NAME)
		groupId = PhysicsService:GetCollisionGroupId(COUNTERS_GROUP_NAME)
	end
	return groupId
end

local function isSignalState(state)
	return type(state) == "table" and type(state.groups) == "table" and type(state.groups.signal) == "table"
end

local function isOccupationState(state)
	return type(state) == "table" and type(state.groups) == "table" and type(state.groups.occupation) == "table"
end

local function isSwitchState(state)
	return type(state) == "table" and type(state.switchAlignment) == "table"
end

local function normalizeComponentType(value)
	if type(value) ~= "string" then
		return nil
	end
	return string.gsub(string.lower(value), "%s+", "")
end

local function findNamedBaseParts(instance, targetName)
	local parts = {}

	local function visit(candidate)
		if candidate:IsA("BasePart") and candidate.Name == targetName then
			push(parts, candidate)
		end
	end

	visit(instance)
	for _, descendant in ipairs(instance:GetDescendants()) do
		visit(descendant)
	end

	return parts
end

local function setPartsActive(parts, active)
	for _, part in ipairs(parts) do
		part.Transparency = active and 0 or 1
		part.CanCollide = active
	end
end

local function setAllBasePartsActive(instance, active)
	local function visit(candidate)
		if candidate:IsA("BasePart") then
			candidate.Transparency = active and 0 or 1
			candidate.CanCollide = active
		end
	end

	visit(instance)
	for _, descendant in ipairs(instance:GetDescendants()) do
		visit(descendant)
	end
end

local function getSwitchVisualGroups(instance)
	return {
		ONE = findNamedBaseParts(instance, "ONE"),
		TWO = findNamedBaseParts(instance, "TWO"),
		THREE = findNamedBaseParts(instance, "THREE"),
	}
end

local function getSwitchVisualVariantForState(traversableState)
	if traversableState == "blTbr" or traversableState == "tlTtrAblTbr" then
		return "ONE"
	end
	if traversableState == "blTtr" then
		return "TWO"
	end
	if traversableState == "blTmr" then
		return "THREE"
	end
	return nil
end

local function applySwitchVisualState(instance, traversableState)
	local visualGroups = getSwitchVisualGroups(instance)
	if #visualGroups.ONE == 0 and #visualGroups.TWO == 0 and #visualGroups.THREE == 0 then
		return
	end

	local targetVariant = getSwitchVisualVariantForState(traversableState)
	if not targetVariant then
		return
	end

	local lastState = switchVisualStateByInstance[instance]
	if lastState and lastState.targetVariant == targetVariant then
		return
	end

	local generation = lastState and lastState.generation + 1 or 1
	switchVisualStateByInstance[instance] = {
		targetVariant = targetVariant,
		generation = generation,
	}

	setAllBasePartsActive(instance, true)

	local currentState = switchVisualStateByInstance[instance]
	if not currentState or currentState.generation ~= generation then
		return
	end

	for variantName, parts in pairs(visualGroups) do
		setPartsActive(parts, variantName == targetVariant)
	end
end

local function addOccupationSection(sections, parts, traversalState)
	if #parts == 0 then
		return
	end

	push(sections, {
		parts = parts,
		traversalState = traversalState,
	})
end

local function buildOccupationSections(instance)
	local sections = {}

	local occupancyParts = findNamedBaseParts(instance, "Occupancy")
	if #occupancyParts > 0 then
		addOccupationSection(sections, occupancyParts, nil)
		return sections
	end

	local crossoverLower = findNamedBaseParts(instance, "Lower")
	local crossoverDiagonal = findNamedBaseParts(instance, "Diagonal")
	local crossoverUpper = findNamedBaseParts(instance, "Upper")
	if #crossoverLower > 0 and #crossoverUpper > 0 then
		addOccupationSection(sections, crossoverLower, "b")
		addOccupationSection(sections, crossoverDiagonal, "blTtr")
		addOccupationSection(sections, crossoverUpper, "t")
		return sections
	end

	local lowerStraight = findNamedBaseParts(instance, "LowerStraight")
	local lowerDiagonal = findNamedBaseParts(instance, "LowerDiagonal")
	local upperStraight = findNamedBaseParts(instance, "UpperStraight")
	local upperDiagonal = findNamedBaseParts(instance, "UpperDiagonal")
	if
		#lowerStraight > 0
		or #lowerDiagonal > 0
		or #upperStraight > 0
		or #upperDiagonal > 0
	then
		addOccupationSection(sections, lowerStraight, "blTbr")
		addOccupationSection(sections, lowerDiagonal, "blTmr")
		addOccupationSection(sections, upperStraight, "blTmr")
		addOccupationSection(sections, upperDiagonal, "blTtr")
		return sections
	end

	local straightParts = findNamedBaseParts(instance, "Straight")
	local diagonalParts = findNamedBaseParts(instance, "Diagonal")
	if #straightParts > 0 or #diagonalParts > 0 then
		addOccupationSection(sections, straightParts, "blTbr")
		addOccupationSection(sections, diagonalParts, "blTtr")
	end

	return sections
end

local function collectTaggedComponents(instance)
	local components = {
		signals = {},
		occupations = buildOccupationSections(instance),
		switches = {},
	}

	local function visit(candidate)
		local componentType = normalizeComponentType(candidate:GetAttribute(COMPONENT_TYPE_ATTRIBUTE))
		if not componentType then
			return
		end

		if SIGNAL_COMPONENT_TYPES[componentType] then
			push(components.signals, candidate)
		end
		if SWITCH_COMPONENT_TYPES[componentType] then
			push(components.switches, candidate)
		end
	end

	visit(instance)
	for _, descendant in ipairs(instance:GetDescendants()) do
		visit(descendant)
	end

	return components
end

function HardwareDriver.DescribeInstance(instance)
	local components = collectTaggedComponents(instance)
	return {
		signals = components.signals,
		occupations = components.occupations,
		switches = components.switches,
		hasSignals = #components.signals > 0,
		hasOccupations = #components.occupations > 0,
		hasSwitches = #components.switches > 0,
	}
end

-- linkedStates contains every JOP tile linked to this Instance. Each entry has:
-- stationId, pieceId, pieceType, groups, texts, and switchAlignment.
function HardwareDriver.ApplyInstanceState(instance, linkedStates, capabilities)
	capabilities = capabilities or HardwareDriver.DescribeInstance(instance)

	local firstSignal = nil
	local firstSwitch = nil
	local firstOccupation = nil
	for _, state in ipairs(linkedStates) do
		if not firstSignal and isSignalState(state) then
			firstSignal = state
		end
		if not firstSwitch and isSwitchState(state) then
			firstSwitch = state
		end
		if not firstOccupation and isOccupationState(state) then
			firstOccupation = state
		end
	end

	for _, signalComponent in ipairs(capabilities.signals) do
		if firstSignal then
			signalComponent:SetAttribute(SIGNAL_STATE_ATTRIBUTE, firstSignal.resolvedSignalAspect)
			signalComponent:SetAttribute(SIGNAL_PIECE_ID_ATTRIBUTE, firstSignal.pieceId)
			signalComponent:SetAttribute(SIGNAL_TEXT_ATTRIBUTE, firstSignal.texts and firstSignal.texts.text or nil)
			if firstSignal.resolvedSignalFamily and firstSignal.resolvedSignalAspect then
				SignalController.Apply(
					signalComponent,
					firstSignal.resolvedSignalFamily,
					firstSignal.resolvedSignalAspect
				)
			end
		else
			signalComponent:SetAttribute(SIGNAL_STATE_ATTRIBUTE, nil)
			signalComponent:SetAttribute(SIGNAL_PIECE_ID_ATTRIBUTE, nil)
			signalComponent:SetAttribute(SIGNAL_TEXT_ATTRIBUTE, nil)
		end
	end

	for _, switchComponent in ipairs(capabilities.switches) do
		if firstSwitch then
			local alignment = firstSwitch.switchAlignment or {}
			switchComponent:SetAttribute(SWITCH_STATE_ATTRIBUTE, alignment.traversableState)
			switchComponent:SetAttribute(SWITCH_PIECE_ID_ATTRIBUTE, firstSwitch.pieceId)
			switchComponent:SetAttribute("JOPResolvedMainPosition", alignment.motorPositions and alignment.motorPositions.main or nil)
			switchComponent:SetAttribute("JOPResolvedUpperPosition", alignment.motorPositions and alignment.motorPositions.upper or nil)
			switchComponent:SetAttribute("JOPResolvedLowerPosition", alignment.motorPositions and alignment.motorPositions.lower or nil)
		else
			switchComponent:SetAttribute(SWITCH_STATE_ATTRIBUTE, nil)
			switchComponent:SetAttribute(SWITCH_PIECE_ID_ATTRIBUTE, nil)
			switchComponent:SetAttribute("JOPResolvedMainPosition", nil)
			switchComponent:SetAttribute("JOPResolvedUpperPosition", nil)
			switchComponent:SetAttribute("JOPResolvedLowerPosition", nil)
		end
	end

	if firstSwitch and firstSwitch.switchAlignment and firstSwitch.switchAlignment.traversableState then
		applySwitchVisualState(instance, firstSwitch.switchAlignment.traversableState)
	end

	for _, occupationComponent in ipairs(capabilities.occupations) do
		local occupationPart = occupationComponent.parts and occupationComponent.parts[1] or occupationComponent
		if firstOccupation then
			occupationPart:SetAttribute("JOPResolvedOccupationState", firstOccupation.groups.occupation.state)
			occupationPart:SetAttribute("JOPResolvedOccupationPieceId", firstOccupation.pieceId)
		else
			occupationPart:SetAttribute("JOPResolvedOccupationState", nil)
			occupationPart:SetAttribute("JOPResolvedOccupationPieceId", nil)
		end
	end

	-- Later, when the final Roblox model contract is defined, replace these
	-- switch and occupation attributes with concrete model wiring while keeping
	-- the bridge protocol stable.
	return true
end

local function observeAttribute(instance, attributeName, callback)
	local connection = instance:GetAttributeChangedSignal(attributeName):Connect(function()
		callback(instance:GetAttribute(attributeName))
	end)
	return function()
		connection:Disconnect()
	end
end

-- report({ occupied = boolean, traversalState = string? }) when a sensor changes.
-- Return a disconnect function so the registry can safely rebuild observers.
function HardwareDriver.ObserveOccupation(instance, report, capabilities)
	capabilities = capabilities or HardwareDriver.DescribeInstance(instance)
	local sections = capabilities.occupations or {}
	if #sections == 0 then
		return function() end
	end

	local countersGroupId = ensureCountersCollisionGroup()
	local running = true
	local lastOccupiedBySection = {}

	task.spawn(function()
		while running do
			for sectionIndex, section in ipairs(sections) do
				local wheelSet = {}
				local count = 0

				for _, block in ipairs(section.parts) do
					if block.Parent then
						local params = OverlapParams.new()
						params.FilterType = Enum.RaycastFilterType.Exclude
						params.FilterDescendantsInstances = { block }
						params.CollisionGroup = countersGroupId
						params.RespectCanCollide = false

						local parts = workspace:GetPartBoundsInBox(
							block.CFrame,
							block.Size + OCCUPANCY_INFLATION,
							params
						)

						for _, part in ipairs(parts) do
							if part.Name:lower():match("mover") and not wheelSet[part] then
								wheelSet[part] = true
								count += 1
							end
						end
					end
				end

				local occupied = count > 0
				if lastOccupiedBySection[sectionIndex] ~= occupied then
					lastOccupiedBySection[sectionIndex] = occupied
					report({
						occupied = occupied,
						traversalState = section.traversalState,
					})
				end
			end

			task.wait(OCCUPANCY_POLL_SECONDS)
		end
	end)

	return function()
		running = false
	end
end

-- report({ controlSlot = "main"|"upper"|"lower", position = "left"|"right" })
-- when the physical switch reports its actual motor position.
function HardwareDriver.ObserveSwitchFeedback(instance, report, capabilities)
	capabilities = capabilities or HardwareDriver.DescribeInstance(instance)
	local disconnectors = {}

	for _, switchComponent in ipairs(capabilities.switches) do
		push(
			disconnectors,
			observeAttribute(switchComponent, POSITION_ATTRIBUTE, function(value)
				local controlSlot = switchComponent:GetAttribute(CONTROL_SLOT_ATTRIBUTE)
				if
					(value ~= "left" and value ~= "right")
					or (controlSlot ~= "main" and controlSlot ~= "upper" and controlSlot ~= "lower")
				then
					return
				end
				report({
					controlSlot = controlSlot,
					position = value,
				})
			end)
		)
	end

	return function()
		for _, disconnect in ipairs(disconnectors) do
			disconnect()
		end
	end
end

return HardwareDriver
