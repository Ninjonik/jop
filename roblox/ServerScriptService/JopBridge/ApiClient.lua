local HttpService = game:GetService("HttpService")

local ApiClient = {}
ApiClient.__index = ApiClient

function ApiClient.new(config)
	local self = setmetatable({}, ApiClient)
	self._baseUrl = string.gsub(config.BackendBaseUrl, "/+$", "")
	self._attempts = config.RequestAttempts
	assert(HttpService.HttpEnabled, "[JOP] Enable Allow HTTP Requests in the experience security settings.")
	local success, authorization = pcall(function()
		return HttpService:GetSecret(config.InboundSecretName):AddPrefix("Bearer ")
	end)
	assert(success, string.format(
		"[JOP] Cannot load Roblox secret %s. Configure it for this experience (and Local Secrets when testing in Studio).",
		config.InboundSecretName
	))
	self._authorization = authorization
	return self
end

function ApiClient:_request(method, path, body, radioRequest)
	local lastError = "request did not run"
	for attempt = 1, self._attempts do
		local success, response = pcall(function()
			return HttpService:RequestAsync({
				Url = self._baseUrl .. path,
				Method = method,
				Headers = {
					["authorization"] = self._authorization,
					["content-type"] = "application/json",
				},
				Body = body and HttpService:JSONEncode(body) or nil,
			})
		end)

		if success and response.Success then
			return HttpService:JSONDecode(response.Body)
		end

		if success and radioRequest and response.StatusCode >= 400 and response.StatusCode < 500 then
			local decodedOk, decoded = pcall(function() return HttpService:JSONDecode(response.Body) end)
			return { error = decodedOk and type(decoded) == "table" and type(decoded.error) == "string" and decoded.error
				or "Neplatná požiadavka. Skontrolujte údaje a skúste znova." }
		end
		if success then
			lastError = string.format("HTTP %d: %s", response.StatusCode, response.Body)
		else
			lastError = tostring(response)
		end
		if attempt < self._attempts then
			task.wait(2 ^ (attempt - 1))
		end
	end
	if radioRequest then
		return { error = "JOP neodpovedá. Stav sa overí po obnovení spojenia." }
	end
	error(string.format("[JOP] %s %s%s failed: %s", method, self._baseUrl, path, lastError))
end

function ApiClient:Register(sessionId, universeId, placeId)
	return self:_request("POST", "/api/roblox/sessions/register", {
		sessionId = sessionId,
		universeId = universeId,
		placeId = placeId,
		serverId = sessionId,
	})
end

function ApiClient:Heartbeat(sessionId)
	return self:_request(
		"POST",
		"/api/roblox/sessions/" .. HttpService:UrlEncode(sessionId) .. "/heartbeat",
		{
			serverId = sessionId,
		}
	)
end

function ApiClient:FetchUpdates(sessionId, afterSequence)
	return self:_request(
		"GET",
		"/api/roblox/sessions/"
			.. HttpService:UrlEncode(sessionId)
			.. "/updates?afterSequence="
			.. HttpService:UrlEncode(tostring(afterSequence or 0))
	)
end

function ApiClient:FetchBridgeScripts()
	return self:_request("GET", "/api/roblox/bridge-scripts")
end

function ApiClient:ReportOccupation(sessionId, report)
	return self:_request(
		"POST",
		"/api/roblox/sessions/" .. HttpService:UrlEncode(sessionId) .. "/occupation",
		report
	)
end

function ApiClient:ReportOccupationBatch(sessionId, reports)
	return self:_request(
		"POST",
		"/api/roblox/sessions/" .. HttpService:UrlEncode(sessionId) .. "/occupation",
		{ events = reports }
	)
end

function ApiClient:ReportSwitchFeedback(sessionId, report)
	return self:_request(
		"POST",
		"/api/roblox/sessions/" .. HttpService:UrlEncode(sessionId) .. "/switch-feedback",
		report
	)
end

function ApiClient:ReportSwitchFeedbackBatch(sessionId, reports)
	return self:_request(
		"POST",
		"/api/roblox/sessions/" .. HttpService:UrlEncode(sessionId) .. "/switch-feedback",
		{ events = reports }
	)
end

function ApiClient:GsmR(sessionId, command)
	local success, result = pcall(function()
		return self:_request(command and "POST" or "GET",
			"/api/roblox/sessions/" .. HttpService:UrlEncode(sessionId) .. "/gsm-r", command, true)
	end)
	if not success then return { error = "Spojenie s JOP zlyhalo. Skúste znova." } end
	return result
end

return ApiClient
