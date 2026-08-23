local HttpService = game:GetService("HttpService")

local ApiClient = {}
ApiClient.__index = ApiClient

function ApiClient.new(config)
	local self = setmetatable({}, ApiClient)
	self._baseUrl = string.gsub(config.BackendBaseUrl, "/+$", "")
	self._attempts = config.RequestAttempts
	self._authorization = HttpService:GetSecret(config.InboundSecretName):AddPrefix("Bearer ")
	return self
end

function ApiClient:_request(method, path, body)
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

		if success then
			lastError = string.format("HTTP %d: %s", response.StatusCode, response.Body)
		else
			lastError = tostring(response)
		end
		if attempt < self._attempts then
			task.wait(2 ^ (attempt - 1))
		end
	end
	error(lastError)
end

function ApiClient:Register(sessionId, placeId)
	return self:_request("POST", "/api/roblox/sessions/register", {
		sessionId = sessionId,
		placeId = placeId,
		serverId = sessionId,
	})
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

return ApiClient
