-- This is the only module that should know the eventual in-game model structure.
-- Keep the bridge and web protocol unchanged when the physical implementation is added.

local HardwareDriver = {}
local SignalController = require(script.Parent.SignalController)
local CollectionService = game:GetService("CollectionService")
local PhysicsService = game:GetService("PhysicsService")
local TweenService = game:GetService("TweenService")

local COMPONENT_TYPE_ATTRIBUTE = "JOPComponentType"
local OCCUPIED_ATTRIBUTE = "JOPOccupied"
local TRAVERSAL_STATE_ATTRIBUTE = "JOPTraversalState"
local CONTROL_SLOT_ATTRIBUTE = "JOPControlSlot"
local POSITION_ATTRIBUTE = "JOPPosition"
local SIGNAL_STATE_ATTRIBUTE = "JOPResolvedSignalState"
local SIGNAL_FAMILY_ATTRIBUTE = "JOPResolvedSignalFamily"
local SIGNAL_CHANGED_AT_ATTRIBUTE = "JOPResolvedSignalChangedAt"
local SIGNAL_PIECE_ID_ATTRIBUTE = "JOPResolvedSignalPieceId"
local SIGNAL_TEXT_ATTRIBUTE = "JOPResolvedSignalText"
local SWITCH_STATE_ATTRIBUTE = "JOPResolvedSwitchState"
local SWITCH_PIECE_ID_ATTRIBUTE = "JOPResolvedSwitchPieceId"
local LEVEL_CROSSING_ACTIVE_ATTRIBUTE = "JOPResolvedLevelCrossingActive"
local LEVEL_CROSSING_CHANGED_AT_ATTRIBUTE = "JOPResolvedLevelCrossingChangedAt"
local LEVEL_CROSSING_RED_UNTIL_ATTRIBUTE = "JOPResolvedLevelCrossingRedUntil"
local LEVEL_CROSSING_WHITE_ENABLED_AT_ATTRIBUTE = "JOPResolvedLevelCrossingWhiteEnabledAt"
local SIGNAL_COMPONENT_TAG = "JOPSignalComponent"
local LEVEL_CROSSING_COMPONENT_TAG = "JOPLevelCrossingComponent"

local SIGNAL_COMPONENT_TYPES = {
	signal = true,
	signalHead = true,
}

local SWITCH_COMPONENT_TYPES = {
	switch = true,
	switchMotor = true,
	switchFeedback = true,
}

local LEVEL_CROSSING_COMPONENT_TYPES = {
	levelCrossing = true,
	levelcrossing = true,
}

local COUNTERS_GROUP_NAME = "Counters"
local OCCUPANCY_INFLATION = Vector3.new(1, 1, 1)
local OCCUPANCY_CLEAR_SETTLE_SECONDS = 0.5
local OCCUPANCY_RECONCILE_SECONDS = 1

local switchVisualStateByInstance = setmetatable({}, { __mode = "k" })
local levelCrossingActiveByInstance = setmetatable({}, { __mode = "k" })
local levelCrossingStateByInstance = setmetatable({}, { __mode = "k" })

local function push(target, value)
	target[#target + 1] = value
end

local function formatMotorPositions(alignment)
	if type(alignment) ~= "table" or type(alignment.motorPositions) ~= "table" then
		return "none"
	end

	local fragments = {}
	for _, slot in ipairs({ "main", "upper", "lower" }) do
		local value = alignment.motorPositions[slot]
		if value ~= nil then
			push(fragments, string.format("%s=%s", slot, tostring(value)))
		end
	end

	if #fragments == 0 then
		return "none"
	end

	return table.concat(fragments, ", ")
end

local function ensureCountersCollisionGroup()
	if not PhysicsService:IsCollisionGroupRegistered(COUNTERS_GROUP_NAME) then
		warn("[JOP] Creating missing collision group: " .. COUNTERS_GROUP_NAME)
		PhysicsService:RegisterCollisionGroup(COUNTERS_GROUP_NAME)
	end
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

local function hasNamedBasePart(instance, targetName)
	if not instance then
		return false
	end

	local success, result = pcall(function()
		local candidate = instance:FindFirstChild(targetName, true)
		return candidate ~= nil and candidate:IsA("BasePart")
	end)

	return success and result == true
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

local function isSensorPart(part)
	return typeof(part) == "Instance"
		and part:IsA("BasePart")
		and string.find(string.lower(part.Name), "vehiclesensor", 1, true) ~= nil
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

	-- Multiple physical part groups can represent one logical traversal (the
	-- extended switch middle route is the important case). Observe them as one
	-- section so one clear group cannot overwrite another group that is still
	-- occupied under the same backend occupation key.
	for _, section in ipairs(sections) do
		if section.traversalState == traversalState then
			for _, part in ipairs(parts) do
				push(section.parts, part)
			end
			return
		end
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
		-- The JOP occupation projection renders a single-switch diagonal as `t`,
		-- so reports must use the same value for reservation release to match.
		addOccupationSection(sections, diagonalParts, "t")
	end

	return sections
end

local function getSectionTouchCount(section)
	local total = 0
	for _, count in pairs(section.touchCounts or {}) do
		total += count
	end
	return total
end

local function sampleSectionOccupied(section)
	local touchingParts = {}

	for _, block in ipairs(section.parts) do
		if block.Parent then
			local params = OverlapParams.new()
			params.FilterType = Enum.RaycastFilterType.Exclude
			params.FilterDescendantsInstances = { block }
			params.CollisionGroup = COUNTERS_GROUP_NAME
			params.RespectCanCollide = false

			local parts = workspace:GetPartBoundsInBox(
				block.CFrame,
				block.Size + OCCUPANCY_INFLATION,
				params
			)

			for _, part in ipairs(parts) do
				if isSensorPart(part) then
					touchingParts[part] = true
				end
			end
		end
	end

	return next(touchingParts) ~= nil, touchingParts
end

local function reportSectionOccupiedChange(section, report, occupied)
	if section.occupied == occupied then
		return
	end

	section.occupied = occupied
	report({
		occupied = occupied,
		traversalState = section.traversalState,
	})
end

local function refreshSectionFromTouchState(section, report)
	reportSectionOccupiedChange(section, report, getSectionTouchCount(section) > 0)
end

-- AŽD 71 crossing controller. It intentionally accepts both known model
-- families: modern models name lamps WhiteLight/RedLightA/RedLightB, while
-- AŽD 71 models use W/R/R1. A model with no ZÁV descendant simply operates
-- as a lights-only crossing.
local DEFAULT_WARNING_SECONDS = 8
local DEFAULT_LOWER_SECONDS = 10
local DEFAULT_RAISE_SECONDS = 7
local DEFAULT_WHITE_DELAY_SECONDS = 30
local BARRIER_UP_X = math.rad(-84)
local BARRIER_DOWN_X = 0

local function positiveNumberOrDefault(value, defaultValue)
	return type(value) == "number" and value > 0 and value or defaultValue
end

local function getLevelCrossingTimings(linkedStates)
	for _, linkedState in ipairs(linkedStates) do
		local timings = linkedState.levelCrossingTimings
		if type(timings) == "table" then
			return {
				warningSeconds = positiveNumberOrDefault(timings.warningSeconds, DEFAULT_WARNING_SECONDS),
				lowerSeconds = positiveNumberOrDefault(timings.lowerSeconds, DEFAULT_LOWER_SECONDS),
				raiseSeconds = positiveNumberOrDefault(timings.raiseSeconds, DEFAULT_RAISE_SECONDS),
				whiteDelaySeconds = positiveNumberOrDefault(timings.whiteDelaySeconds, DEFAULT_WHITE_DELAY_SECONDS),
			}
		end
	end
	return {
		warningSeconds = DEFAULT_WARNING_SECONDS,
		lowerSeconds = DEFAULT_LOWER_SECONDS,
		raiseSeconds = DEFAULT_RAISE_SECONDS,
		whiteDelaySeconds = DEFAULT_WHITE_DELAY_SECONDS,
	}
end

local function findNamedDescendants(instance, targetNames, className)
	local found = {}
	local names = {}
	for _, name in ipairs(targetNames) do
		names[name] = true
	end

	local function visit(candidate)
		if names[candidate.Name] and (not className or candidate:IsA(className)) then
			push(found, candidate)
		end
	end

	visit(instance)
	for _, descendant in ipairs(instance:GetDescendants()) do
		visit(descendant)
	end
	return found
end

local function isBellSound(component, sound)
	local ancestor = sound.Parent
	while ancestor and ancestor ~= component do
		if ancestor.Name == "Reproduktor" then
			return true
		end
		ancestor = ancestor.Parent
	end
	return false
end

local function getLevelCrossingHardware(component)
	local barriers = findNamedDescendants(component, { "ZÁV", "ZAV" }, "Model")
	local bells = {}
	for _, descendant in ipairs(component:GetDescendants()) do
		if descendant:IsA("Sound") and isBellSound(component, descendant) then
			push(bells, descendant)
		end
	end

	return {
		barriers = barriers,
		bells = bells,
	}
end

local function setBellsActive(bells, active)
	for _, bell in ipairs(bells) do
		if active then
			bell.Looped = true
			if not bell.IsPlaying then bell:Play() end
		else
			bell:Stop()
		end
	end
end

local function getBarrierTargetCFrame(barrier, xAngle)
	local pivot = barrier:GetPivot()
	local _, yAngle, zAngle = pivot:ToOrientation()
	return CFrame.new(pivot.Position) * CFrame.fromOrientation(xAngle, yAngle, zAngle)
end

local function setBarrierPosition(barrier, xAngle)
	barrier:PivotTo(getBarrierTargetCFrame(barrier, xAngle))
end

local function tweenBarriers(state, xAngle, tweenInfo)
	local tweens = {}
	for _, barrier in ipairs(state.hardware.barriers) do
		if barrier.Parent then
			local driver = Instance.new("CFrameValue")
			driver.Value = barrier:GetPivot()
			local connection = driver:GetPropertyChangedSignal("Value"):Connect(function()
				if barrier.Parent then barrier:PivotTo(driver.Value) end
			end)
			local tween = TweenService:Create(driver, tweenInfo, { Value = getBarrierTargetCFrame(barrier, xAngle) })
			push(tweens, {
				tween = tween,
				driver = driver,
				connection = connection,
				duration = tweenInfo.Time,
			})
			tween:Play()
		end
	end
	state.barrierTweens = tweens
	return tweens
end

local function cancelBarrierTweens(state)
	for _, entry in ipairs(state.barrierTweens or {}) do
		entry.tween:Cancel()
		entry.connection:Disconnect()
		entry.driver:Destroy()
	end
	state.barrierTweens = {}
end

local function waitForBarrierTweens(tweens)
	local duration = 0
	for _, entry in ipairs(tweens) do
		duration = math.max(duration, entry.duration or 0)
	end
	if duration > 0 then task.wait(duration) end
	for _, entry in ipairs(tweens) do
		entry.connection:Disconnect()
		entry.driver:Destroy()
	end
end

local function setLevelCrossingWhiteReturn(component, state)
	component:SetAttribute(
		LEVEL_CROSSING_WHITE_ENABLED_AT_ATTRIBUTE,
		state.whiteAllowed and workspace:GetServerTimeNow() + state.timings.whiteDelaySeconds or math.huge
	)
end

local function activateLevelCrossing(component, linkedStates, whiteAllowed)
	local state = levelCrossingStateByInstance[component]
	if not state then
		state = {
			active = false,
			whiteAllowed = whiteAllowed,
			timings = getLevelCrossingTimings(linkedStates),
			barriersRaised = true,
			generation = 0,
			barrierTweens = {},
			hardware = getLevelCrossingHardware(component),
		}
		levelCrossingStateByInstance[component] = state
		for _, barrier in ipairs(state.hardware.barriers) do setBarrierPosition(barrier, BARRIER_UP_X) end
	end
	if state.active then return end

	state.active = true
	state.whiteAllowed = whiteAllowed
	state.timings = getLevelCrossingTimings(linkedStates)
	state.barriersRaised = false
	state.generation += 1
	local generation = state.generation
	cancelBarrierTweens(state)
	setBellsActive(state.hardware.bells, true)

	task.spawn(function()
		task.wait(state.timings.warningSeconds)
		if not state.active or state.generation ~= generation then return end
		local tweens = tweenBarriers(state, BARRIER_DOWN_X, TweenInfo.new(state.timings.lowerSeconds, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut))
		waitForBarrierTweens(tweens)
		if not state.active or state.generation ~= generation then return end
		state.barrierTweens = {}
	end)
end

local function deactivateLevelCrossing(component, linkedStates, whiteAllowed)
	local state = levelCrossingStateByInstance[component]
	if not state then
		state = {
			active = false, whiteAllowed = whiteAllowed, timings = getLevelCrossingTimings(linkedStates), barriersRaised = true, generation = 0, barrierTweens = {},
			hardware = getLevelCrossingHardware(component),
		}
		levelCrossingStateByInstance[component] = state
		for _, barrier in ipairs(state.hardware.barriers) do setBarrierPosition(barrier, BARRIER_UP_X) end
		component:SetAttribute(
			LEVEL_CROSSING_WHITE_ENABLED_AT_ATTRIBUTE,
			whiteAllowed and workspace:GetServerTimeNow() or math.huge
		)
		return
	end
	state.whiteAllowed = whiteAllowed
	state.timings = getLevelCrossingTimings(linkedStates)
	if not state.active then
		if state.barriersRaised then setLevelCrossingWhiteReturn(component, state) end
		return
	end

	state.active = false
	state.barriersRaised = false
	state.generation += 1
	local generation = state.generation
	cancelBarrierTweens(state)

	task.spawn(function()
		local tweens = tweenBarriers(state, BARRIER_UP_X, TweenInfo.new(state.timings.raiseSeconds, Enum.EasingStyle.Quad, Enum.EasingDirection.Out))
		waitForBarrierTweens(tweens)
		if state.active or state.generation ~= generation then return end
		state.barrierTweens = {}
		state.barriersRaised = true
		setBellsActive(state.hardware.bells, false)
		setLevelCrossingWhiteReturn(component, state)
	end)
end

local function collectTaggedComponents(instance)
	local components = {
		signals = {},
		occupations = buildOccupationSections(instance),
		switches = {},
		levelCrossings = {},
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
		if LEVEL_CROSSING_COMPONENT_TYPES[componentType] then
			push(components.levelCrossings, candidate)
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

	if #components.signals == 0 then
		local componentType = nil
		if instance and instance.GetAttribute then
			componentType = normalizeComponentType(instance:GetAttribute(COMPONENT_TYPE_ATTRIBUTE))
		end

		local hasSignalLamp = hasNamedBasePart(instance, "z") or hasNamedBasePart(instance, "c")
		if SIGNAL_COMPONENT_TYPES[componentType] or hasSignalLamp then
			push(components.signals, instance)
		end
	end

	if #components.switches == 0 then
		local componentType = nil
		if instance and instance.GetAttribute then
			componentType = normalizeComponentType(instance:GetAttribute(COMPONENT_TYPE_ATTRIBUTE))
		end

		local hasSwitchVariant = hasNamedBasePart(instance, "ONE")
			or hasNamedBasePart(instance, "TWO")
			or hasNamedBasePart(instance, "THREE")
		if
			SWITCH_COMPONENT_TYPES[componentType]
			or hasSwitchVariant
		then
			push(components.switches, instance)
		end
	end

	return {
		signals = components.signals,
		occupations = components.occupations,
		switches = components.switches,
		levelCrossings = components.levelCrossings,
		hasSignals = #components.signals > 0,
		hasOccupations = #components.occupations > 0,
		hasSwitches = #components.switches > 0,
		hasLevelCrossings = #components.levelCrossings > 0,
	}
end

-- linkedStates contains every JOP tile linked to this Instance. Each entry has:
-- stationId, pieceId, pieceType, groups, texts, and switchAlignment.
function HardwareDriver.ApplyInstanceState(instance, linkedStates, capabilities)
	capabilities = capabilities or HardwareDriver.DescribeInstance(instance)

	local firstSignal = nil
	local firstSwitch = nil
	local firstOccupation = nil
	local levelCrossingActive = false
	local levelCrossingWhiteAllowed = true
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
		if state.levelCrossingActive == true then
			levelCrossingActive = true
		end
		if state.levelCrossingWhiteAllowed == false then
			levelCrossingWhiteAllowed = false
		end
	end

	for _, levelCrossingComponent in ipairs(capabilities.levelCrossings or {}) do
		CollectionService:AddTag(levelCrossingComponent, LEVEL_CROSSING_COMPONENT_TAG)
		local wasActive = levelCrossingActiveByInstance[levelCrossingComponent]
		if wasActive ~= levelCrossingActive then
			local changedAt = workspace:GetServerTimeNow()
			levelCrossingActiveByInstance[levelCrossingComponent] = levelCrossingActive
			levelCrossingComponent:SetAttribute(LEVEL_CROSSING_ACTIVE_ATTRIBUTE, levelCrossingActive)
			levelCrossingComponent:SetAttribute(LEVEL_CROSSING_CHANGED_AT_ATTRIBUTE, changedAt)
			if levelCrossingActive then
				levelCrossingComponent:SetAttribute(LEVEL_CROSSING_RED_UNTIL_ATTRIBUTE, math.huge)
				levelCrossingComponent:SetAttribute(LEVEL_CROSSING_WHITE_ENABLED_AT_ATTRIBUTE, nil)
				activateLevelCrossing(levelCrossingComponent, linkedStates, levelCrossingWhiteAllowed)
			else
				local timings = getLevelCrossingTimings(linkedStates)
				levelCrossingComponent:SetAttribute(LEVEL_CROSSING_RED_UNTIL_ATTRIBUTE, wasActive == nil and changedAt or changedAt + timings.raiseSeconds)
				levelCrossingComponent:SetAttribute(LEVEL_CROSSING_WHITE_ENABLED_AT_ATTRIBUTE, math.huge)
				deactivateLevelCrossing(levelCrossingComponent, linkedStates, levelCrossingWhiteAllowed)
			end
		else
			local state = levelCrossingStateByInstance[levelCrossingComponent]
			if state then
				local whiteAllowedChanged = state.whiteAllowed ~= levelCrossingWhiteAllowed
				state.whiteAllowed = levelCrossingWhiteAllowed
				if whiteAllowedChanged and not state.active and state.barriersRaised then
					setLevelCrossingWhiteReturn(levelCrossingComponent, state)
				end
			end
		end
	end

	for _, signalComponent in ipairs(capabilities.signals) do
		if firstSignal then
			CollectionService:AddTag(signalComponent, SIGNAL_COMPONENT_TAG)
			local previousAspect = signalComponent:GetAttribute(SIGNAL_STATE_ATTRIBUTE)
			local previousFamily = signalComponent:GetAttribute(SIGNAL_FAMILY_ATTRIBUTE)
			signalComponent:SetAttribute(SIGNAL_STATE_ATTRIBUTE, firstSignal.resolvedSignalAspect)
			signalComponent:SetAttribute(SIGNAL_FAMILY_ATTRIBUTE, firstSignal.resolvedSignalFamily)
			signalComponent:SetAttribute(SIGNAL_PIECE_ID_ATTRIBUTE, firstSignal.pieceId)
			signalComponent:SetAttribute(SIGNAL_TEXT_ATTRIBUTE, firstSignal.texts and firstSignal.texts.text or nil)
			if
				firstSignal.resolvedSignalFamily
				and firstSignal.resolvedSignalAspect
				and (previousAspect ~= firstSignal.resolvedSignalAspect or previousFamily ~= firstSignal.resolvedSignalFamily)
			then
				signalComponent:SetAttribute(SIGNAL_CHANGED_AT_ATTRIBUTE, workspace:GetServerTimeNow())
				SignalController.Apply(
					signalComponent,
					firstSignal.resolvedSignalFamily,
					firstSignal.resolvedSignalAspect
				)
			end
		else
			CollectionService:RemoveTag(signalComponent, SIGNAL_COMPONENT_TAG)
			signalComponent:SetAttribute(SIGNAL_STATE_ATTRIBUTE, nil)
			signalComponent:SetAttribute(SIGNAL_FAMILY_ATTRIBUTE, nil)
			signalComponent:SetAttribute(SIGNAL_CHANGED_AT_ATTRIBUTE, nil)
			signalComponent:SetAttribute(SIGNAL_PIECE_ID_ATTRIBUTE, nil)
			signalComponent:SetAttribute(SIGNAL_TEXT_ATTRIBUTE, nil)
		end
	end

	for _, switchComponent in ipairs(capabilities.switches) do
		if firstSwitch then
			local alignment = firstSwitch.switchAlignment or {}
			print(
				string.format(
					"[JOP][Apply] - Setting Switch %s piece=%s station=%s state=%s motors=[%s]",
					switchComponent:GetFullName(),
					tostring(firstSwitch.pieceId),
					tostring(firstSwitch.stationId),
					tostring(alignment.traversableState),
					formatMotorPositions(alignment)
				)
			)
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

	-- Switch and occupation components still expose their resolved state through
	-- attributes; their physical model contracts remain independent of crossing
	-- control.
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

	ensureCountersCollisionGroup()
	local running = true
	local disconnectors = {}

	for _, section in ipairs(sections) do
		section.touchCounts = {}
		section.occupied = false
		section.clearGeneration = 0

		local initiallyOccupied, sampledTouchingParts = sampleSectionOccupied(section)
		for part, _ in pairs(sampledTouchingParts) do
			section.touchCounts[part] = 1
		end
		reportSectionOccupiedChange(section, report, initiallyOccupied)

		local function noteTouch(part)
			if not running or not isSensorPart(part) then
				return
			end

			section.touchCounts[part] = (section.touchCounts[part] or 0) + 1
			section.clearGeneration += 1
			refreshSectionFromTouchState(section, report)
		end

		local function noteTouchEnded(part)
			if not running or not isSensorPart(part) then
				return
			end

			local current = section.touchCounts[part]
			if current == nil then
				return
			end

			if current <= 1 then
				section.touchCounts[part] = nil
			else
				section.touchCounts[part] = current - 1
			end

			if getSectionTouchCount(section) > 0 then
				refreshSectionFromTouchState(section, report)
				return
			end

			section.clearGeneration += 1
			local generation = section.clearGeneration
			task.delay(OCCUPANCY_CLEAR_SETTLE_SECONDS, function()
				if not running or section.clearGeneration ~= generation then
					return
				end

				local occupied, resampledTouchingParts = sampleSectionOccupied(section)
				section.touchCounts = {}
				for sampledPart, _ in pairs(resampledTouchingParts) do
					section.touchCounts[sampledPart] = 1
				end
				reportSectionOccupiedChange(section, report, occupied)
			end)
		end

		for _, block in ipairs(section.parts) do
			push(disconnectors, block.Touched:Connect(noteTouch))
			push(disconnectors, block.TouchEnded:Connect(noteTouchEnded))
		end
	end

	task.spawn(function()
		while running do
			task.wait(OCCUPANCY_RECONCILE_SECONDS)

			if not running then
				break
			end

			for _, section in ipairs(sections) do
				if not section.occupied then
					continue
				end

				local occupied, touchingParts = sampleSectionOccupied(section)
				section.touchCounts = {}
				for sampledPart, _ in pairs(touchingParts) do
					section.touchCounts[sampledPart] = 1
				end
				reportSectionOccupiedChange(section, report, occupied)
			end
		end
	end)

	return function()
		running = false
		for _, connection in ipairs(disconnectors) do
			connection:Disconnect()
		end
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
