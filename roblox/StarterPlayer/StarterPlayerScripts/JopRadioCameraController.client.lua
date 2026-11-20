-- Local presentation only. Radio keypad actions still go to the authoritative server.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Workspace = game:GetService("Workspace")
local player = Players.LocalPlayer
local RENDER_NAME = "JOPRadioCloseUp"
local EXIT_ACTION = "JOPRadioCloseUpExit"
local MAX_DISTANCE = 12
local active

local function displayBasis(display, face)
	local normal = Vector3.FromNormalId(face)
	-- Front/back/side faces have the part's local Y as screen-up. The top
	-- and bottom faces use a perpendicular axis so lookAt remains defined.
	local up = Vector3.new(0, 1, 0)
	if face == Enum.NormalId.Top then up = Vector3.new(0, 0, -1)
	elseif face == Enum.NormalId.Bottom then up = Vector3.new(0, 0, 1) end
	return display.CFrame * CFrame.lookAt(Vector3.zero, -normal, up)
end

local function radioCorners(radio, basis)
	local points = {}
	local minX, maxX, minY, maxY = math.huge, -math.huge, math.huge, -math.huge
	for _, part in ipairs(radio:GetDescendants()) do
		if not part:IsA("BasePart") then continue end
		for _, x in ipairs({ -1, 1 }) do
			for _, y in ipairs({ -1, 1 }) do
				for _, z in ipairs({ -1, 1 }) do
					local corner = basis:PointToObjectSpace(part.CFrame:PointToWorldSpace(
						Vector3.new(x * part.Size.X / 2, y * part.Size.Y / 2, z * part.Size.Z / 2)))
					table.insert(points, corner)
					minX, maxX = math.min(minX, corner.X), math.max(maxX, corner.X)
					minY, maxY = math.min(minY, corner.Y), math.max(maxY, corner.Y)
				end
			end
		end
	end
	return points, (minX + maxX) / 2, (minY + maxY) / 2
end

local function exitCloseUp()
	if not active then return end
	local previous = active
	active = nil
	RunService:UnbindFromRenderStep(RENDER_NAME)
	ContextActionService:UnbindAction(EXIT_ACTION)
	local camera = previous.camera
	if camera.Parent then
		camera.FieldOfViewMode = previous.fieldOfViewMode
		camera.FieldOfView = previous.fieldOfView
		camera.CFrame, camera.Focus = previous.cframe, previous.focus
		local subject = previous.subject
		if subject and not subject.Parent then
			subject = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		end
		camera.CameraSubject = subject
		camera.CameraType = previous.cameraType
	end
	UserInputService.MouseBehavior = previous.mouseBehavior
	UserInputService.MouseIconEnabled = previous.mouseIconEnabled
end

local function inRange(radio, display)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	return radio:IsDescendantOf(Workspace) and display:IsDescendantOf(radio)
		and root and humanoid and humanoid.Health > 0
		and (root.Position - display.Position).Magnitude <= MAX_DISTANCE
end

local function updateCamera()
	if not active then return end
	local view = active
	if Workspace.CurrentCamera ~= view.camera or not inRange(view.radio, view.display) then
		exitCloseUp(); return
	end
	local camera = view.camera
	local viewport = camera.ViewportSize
	if viewport.X <= 0 or viewport.Y <= 0 then return end
	local tanVertical = math.tan(math.rad(view.fieldOfView) / 2)
	local tanHorizontal = tanVertical * viewport.X / viewport.Y
	local distance = -math.huge
	for _, point in ipairs(view.points) do
		-- Fit every mesh bounding-box corner, including protruding keys. On
		-- narrow screens fit the height too, rather than cutting off controls.
		distance = math.max(distance, point.Z + math.max(
			math.abs(point.X - view.centerX) * 1.02 / tanHorizontal,
			math.abs(point.Y - view.centerY) * 1.02 / tanVertical,
			math.abs(camera.NearPlaneZ) + 0.05))
	end
	local basis = displayBasis(view.display, view.face)
	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfViewMode = Enum.FieldOfViewMode.Vertical
	camera.FieldOfView = view.fieldOfView
	camera.CFrame = basis * CFrame.new(view.centerX, view.centerY, distance)
	camera.Focus = basis * CFrame.new(view.centerX, view.centerY, 0)
	UserInputService.MouseBehavior = Enum.MouseBehavior.Default
	UserInputService.MouseIconEnabled = true
end

local function enterCloseUp(radio)
	if active and active.radio == radio then return end
	local display = radio:FindFirstChild("Part")
	local gui = display and display:FindFirstChildOfClass("SurfaceGui")
	if not display or not display:IsA("BasePart") or not gui or not inRange(radio, display) then return end
	local camera = Workspace.CurrentCamera
	if not camera then return end
	local basis = displayBasis(display, gui.Face)
	local points, centerX, centerY = radioCorners(radio, basis)
	if #points == 0 then return end
	exitCloseUp()
	active = {
		radio = radio, display = display, face = gui.Face,
		points = points, centerX = centerX, centerY = centerY,
		camera = camera, cameraType = camera.CameraType, subject = camera.CameraSubject,
		cframe = camera.CFrame, focus = camera.Focus,
		fieldOfView = camera.FieldOfView, fieldOfViewMode = camera.FieldOfViewMode,
		mouseBehavior = UserInputService.MouseBehavior, mouseIconEnabled = UserInputService.MouseIconEnabled,
	}
	ContextActionService:BindActionAtPriority(EXIT_ACTION, function(_, state)
		if state == Enum.UserInputState.Begin then exitCloseUp() end
		return Enum.ContextActionResult.Sink
	end, true, Enum.ContextActionPriority.High.Value + 1,
		Enum.KeyCode.Escape, Enum.KeyCode.Backspace, Enum.KeyCode.ButtonB)
	ContextActionService:SetTitle(EXIT_ACTION, "Späť")
	ContextActionService:SetPosition(EXIT_ACTION, UDim2.new(1, -100, 1, -100))
	RunService:BindToRenderStep(RENDER_NAME, Enum.RenderPriority.Camera.Value + 1, updateCamera)
	updateCamera()
end

UserInputService.InputBegan:Connect(function(input, processed)
	-- CoreGui may consume Escape before a contextual action sees it.
	if active and (input.KeyCode == Enum.KeyCode.Escape or input.KeyCode == Enum.KeyCode.Backspace) then
		exitCloseUp(); return
	end
	if processed or GuiService.MenuIsOpen then return end
	if input.UserInputType ~= Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.Touch then return end
	local camera = Workspace.CurrentCamera
	if not camera then return end
	local ray = camera:ScreenPointToRay(input.Position.X, input.Position.Y)
	local parameters = RaycastParams.new()
	parameters.FilterType = Enum.RaycastFilterType.Exclude
	parameters.FilterDescendantsInstances = player.Character and { player.Character } or {}
	local hit = Workspace:Raycast(ray.Origin, ray.Direction * 1000, parameters)
	local part = hit and hit.Instance
	local radio = part
	while radio and radio ~= Workspace do
		if radio:IsA("Model") and radio.Name == "RadioStation" then break end
		radio = radio.Parent
	end
	if not radio or radio == Workspace then return end
	local hull = radio:FindFirstChild("Hull")
	-- Keypad clicks retain their normal action and never trigger a camera jump.
	if part == radio:FindFirstChild("Part") or (hull and part:IsDescendantOf(hull)) then
		enterCloseUp(radio)
	end
end)
GuiService.MenuOpened:Connect(exitCloseUp)
player.CharacterRemoving:Connect(exitCloseUp)
script.Destroying:Connect(exitCloseUp)
