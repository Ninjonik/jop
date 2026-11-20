-- Script, RunContext = Server. The bridge also discovers radios at startup.
-- Requiring one ModuleScript ensures that cabins never create independent state.
local bridge = game:GetService("ServerScriptService"):WaitForChild("JopBridge")
require(bridge:WaitForChild("GsmRController")).Attach(script.Parent)
