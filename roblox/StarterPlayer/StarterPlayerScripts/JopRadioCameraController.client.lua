-- Local presentation only. Radio keypad actions still go to the authoritative server.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Workspace = game:GetService("Workspace")
local Visibility=require(game:GetService("ReplicatedStorage"):WaitForChild("RailKit750"):WaitForChild("RailInteractionVisibility"))
local player = Players.LocalPlayer
local owner=player:FindFirstChild("RailKitRadioOwner") or Instance.new("ObjectValue")
owner.Name="RailKitRadioOwner" owner.Parent=player
if owner.Value and owner.Value.Parent then return end
owner.Value=script

local RENDER_NAME = "JOPRadioCloseUp"
local EXIT_ACTION = "JOPRadioCloseUpExit"
local MAX_DISTANCE = 12
local active
local pendingWorldClick
local function interfaceActive(point)
	if UserInputService:GetFocusedTextBox() or GuiService.MenuIsOpen then return true end
	local inset=GuiService:GetGuiInset()
	if point.Y < inset.Y then return true end
	for _,object in player.PlayerGui:GetGuiObjectsAtPosition(point.X,point.Y) do
		if object:IsA("GuiButton") or object:IsA("TextBox") or (object:IsA("ScrollingFrame") and object.Active) then return true end
	end
	return false
end

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
	pendingWorldClick=nil
	player:SetAttribute("RailRadioCloseUp",false)
	RunService:UnbindFromRenderStep(RENDER_NAME)
	ContextActionService:UnbindAction(EXIT_ACTION)
	-- A captured lock can be a temporary RMB-drag lock, not the player's mode.
	-- Clear it before handing back to Roblox; FPS/shift-lock reacquire their own
	-- lock through the normal camera controller, which remains authoritative.
	UserInputService.MouseBehavior = Enum.MouseBehavior.Default
	if previous.gui.Parent then previous.gui.AlwaysOnTop = previous.alwaysOnTop end
	local camera = previous.camera
	if camera.Parent then
		camera.FieldOfViewMode = previous.fieldOfViewMode
		camera.FieldOfView = previous.fieldOfView
		local humanoid=player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		local sameSeat=humanoid and humanoid.SeatPart==previous.seat
		if sameSeat and previous.seat and previous.seat.Parent then
			camera.CFrame=previous.seat.CFrame*previous.seatFrame
			camera.Focus=previous.seat.CFrame*previous.seatFocus
		elseif not sameSeat and humanoid and player.Character:FindFirstChild("Head") then
			camera.CFrame=player.Character.Head.CFrame
			camera.Focus=camera.CFrame*CFrame.new(0,0,-12)
		else camera.CFrame,camera.Focus=previous.cframe,previous.focus end
		local subject = previous.subject
		if subject and not subject.Parent then
			subject = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		end
		camera.CameraSubject = if humanoid and not sameSeat then humanoid else subject
		camera.CameraType = if not sameSeat or previous.cameraType==Enum.CameraType.Scriptable then Enum.CameraType.Custom else previous.cameraType
	end
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
	local humanoid=player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if Workspace.CurrentCamera ~= view.camera or not inRange(view.radio, view.display)
	or not humanoid or humanoid.SeatPart~=view.seat or player:GetAttribute("RailFreecamActive") then
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
	if active and active.radio == radio then exitCloseUp(); return end
	local display = radio:FindFirstChild("Part")
	local gui = display and display:FindFirstChildOfClass("SurfaceGui")
	if not display or not display:IsA("BasePart") or not gui or not inRange(radio, display) then return end
	local camera = Workspace.CurrentCamera
	if not camera then return end
	local basis = displayBasis(display, gui.Face)
	local points, centerX, centerY = radioCorners(radio, basis)
	if #points == 0 then return end
	exitCloseUp()
	local humanoid=player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	local seat=humanoid and humanoid.SeatPart
	player:SetAttribute("RailRadioCloseUp",true)
	active = {
		seat=seat,seatFrame=seat and seat.CFrame:ToObjectSpace(camera.CFrame),seatFocus=seat and seat.CFrame:ToObjectSpace(camera.Focus),
		radio = radio, display = display, face = gui.Face, gui = gui, alwaysOnTop = gui.AlwaysOnTop,
		points = points, centerX = centerX, centerY = centerY,
		camera = camera, cameraType = camera.CameraType, subject = camera.CameraSubject,
		cframe = camera.CFrame, focus = camera.Focus,
		fieldOfView = player:GetAttribute("RailZoomBaselineFOV") or camera.FieldOfView, fieldOfViewMode = camera.FieldOfViewMode,
		mouseIconEnabled = UserInputService.MouseIconEnabled,
	}
	-- Only the focused panel bypasses depth testing, so a coplanar housing mesh
	-- cannot cut triangles out of the text. Other radios stay world-occluded.
	gui.AlwaysOnTop = true
	UserInputService.MouseBehavior = Enum.MouseBehavior.Default
	ContextActionService:BindActionAtPriority(EXIT_ACTION, function(_, state)
		if UserInputService:GetFocusedTextBox() or GuiService.MenuIsOpen then return Enum.ContextActionResult.Pass end
		if state == Enum.UserInputState.Begin then exitCloseUp() end
		return Enum.ContextActionResult.Sink
	end, true, Enum.ContextActionPriority.High.Value + 1,
		Enum.KeyCode.Escape, Enum.KeyCode.ButtonB)
	ContextActionService:SetTitle(EXIT_ACTION, "Späť")
	ContextActionService:SetPosition(EXIT_ACTION, UDim2.new(1, -100, 1, -100))
	RunService:BindToRenderStep(RENDER_NAME, Enum.RenderPriority.Camera.Value + 1, updateCamera)
	updateCamera()
end

UserInputService.InputBegan:Connect(function(input, processed)
	if UserInputService:GetFocusedTextBox() or GuiService.MenuIsOpen then return end
	if active and (input.KeyCode == Enum.KeyCode.Escape ) then
		exitCloseUp(); return
	end
	if input.UserInputType ~= Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.Touch then return end
	local point=if input.UserInputType==Enum.UserInputType.Touch then Vector2.new(input.Position.X,input.Position.Y) else UserInputService:GetMouseLocation()
	if interfaceActive(point) then return end
	if active then
		if not processed then pendingWorldClick={point=point,view=active} end
		return
	end
	if processed then return end
	local camera = Workspace.CurrentCamera
	if not camera then return end
	local point = UserInputService:GetMouseLocation()
	local ray = camera:ViewportPointToRay(point.X, point.Y)
	local parameters = RaycastParams.new()
	parameters.FilterType = Enum.RaycastFilterType.Include
	local radios={}
	for _,stock in game:GetService("CollectionService"):GetTagged("RailKitTrainCar") do
		if stock:IsDescendantOf(Workspace) then
			local body=stock:FindFirstChild("Body")
			if body then for _,radio in body:GetChildren() do
				if radio:IsA("Model") and radio.Name=="RadioStation" then table.insert(radios,radio) end
			end end
		end
	end
	parameters.FilterDescendantsInstances=radios
	local hit = Workspace:Raycast(ray.Origin, ray.Direction * 1000, parameters)
	if hit and not Visibility.clear(ray.Origin,hit.Position,hit.Instance,player.Character) then return end
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
-- Use the same rendered camera as the hover picker, including while moving.
RunService:BindToRenderStep("JOPRadioOutsideClick",Enum.RenderPriority.Last.Value,function()
	local click=pendingWorldClick pendingWorldClick=nil
	if not click or active~=click.view or interfaceActive(click.point) then return end
	local camera=Workspace.CurrentCamera
	if not camera then return end
	local ray=camera:ViewportPointToRay(click.point.X,click.point.Y)
	local params=RaycastParams.new() params.FilterType=Enum.RaycastFilterType.Include
	local buttons=active.radio:FindFirstChild("Buttons")
	params.FilterDescendantsInstances=buttons and {buttons} or {}
	if not Workspace:Raycast(ray.Origin,ray.Direction*MAX_DISTANCE,params) then exitCloseUp() end
end)
GuiService.MenuOpened:Connect(function() pendingWorldClick=nil end)
player.CharacterRemoving:Connect(exitCloseUp)
script.Destroying:Connect(function() exitCloseUp();RunService:UnbindFromRenderStep("JOPRadioOutsideClick") end)

local seatConnection
local function trackCharacter(character)
	if seatConnection then seatConnection:Disconnect() end
	local h=character:WaitForChild("Humanoid")
	seatConnection=h:GetPropertyChangedSignal("SeatPart"):Connect(function()
		if active and h.SeatPart~=active.seat then exitCloseUp() end
	end)
end
player.CharacterAdded:Connect(trackCharacter)
if player.Character then task.spawn(trackCharacter,player.Character) end
player:GetAttributeChangedSignal("RailFreecamActive"):Connect(function() if player:GetAttribute("RailFreecamActive") then exitCloseUp() end end)
