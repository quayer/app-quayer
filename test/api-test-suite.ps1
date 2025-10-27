# API Test Suite - WhatsApp Instance Manager
# PowerShell Script for Complete End-to-End Testing

$baseUrl = "http://localhost:3000/api/v1"
$testResults = @()

function Test-API {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Body = $null,
        [int]$ExpectedStatus = 200
    )

    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "TEST: $Name" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan

    $url = "$baseUrl$Endpoint"
    Write-Host "Method: $Method" -ForegroundColor Gray
    Write-Host "URL: $url" -ForegroundColor Gray

    try {
        $params = @{
            Uri = $url
            Method = $Method
            ContentType = "application/json"
            TimeoutSec = 30
        }

        if ($Body) {
            $jsonBody = $Body | ConvertTo-Json
            $params.Body = $jsonBody
            Write-Host "Body: $jsonBody" -ForegroundColor Gray
        }

        $startTime = Get-Date
        $response = Invoke-WebRequest @params
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalMilliseconds

        $statusCode = $response.StatusCode
        $content = $response.Content | ConvertFrom-Json

        $passed = $statusCode -eq $ExpectedStatus

        if ($passed) {
            Write-Host "✓ PASSED" -ForegroundColor Green
            Write-Host "Status: $statusCode (Expected: $ExpectedStatus)" -ForegroundColor Green
            Write-Host "Duration: ${duration}ms" -ForegroundColor Green
        } else {
            Write-Host "✗ FAILED" -ForegroundColor Red
            Write-Host "Status: $statusCode (Expected: $ExpectedStatus)" -ForegroundColor Red
            Write-Host "Duration: ${duration}ms" -ForegroundColor Red
        }

        Write-Host "Response:" -ForegroundColor Gray
        Write-Host ($content | ConvertTo-Json -Depth 10) -ForegroundColor White

        $testResults += @{
            Name = $Name
            Passed = $passed
            Status = $statusCode
            Expected = $ExpectedStatus
            Duration = $duration
        }

        return $content

    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $duration = 0

        Write-Host "✗ FAILED" -ForegroundColor Red
        Write-Host "Status: $statusCode (Expected: $ExpectedStatus)" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red

        $testResults += @{
            Name = $Name
            Passed = $false
            Status = $statusCode
            Expected = $ExpectedStatus
            Duration = $duration
            Error = $_.Exception.Message
        }

        return $null
    }
}

function Show-TestSummary {
    Write-Host "`n`n========================================" -ForegroundColor Cyan
    Write-Host "TEST SUMMARY" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan

    $total = $testResults.Count
    $passed = ($testResults | Where-Object { $_.Passed }).Count
    $failed = $total - $passed
    $passRate = [math]::Round(($passed / $total) * 100, 2)

    Write-Host "`nTotal Tests: $total" -ForegroundColor White
    Write-Host "Passed: $passed" -ForegroundColor Green
    Write-Host "Failed: $failed" -ForegroundColor Red
    Write-Host "Pass Rate: $passRate%" -ForegroundColor $(if ($passRate -ge 90) { "Green" } elseif ($passRate -ge 70) { "Yellow" } else { "Red" })

    Write-Host "`nDetailed Results:" -ForegroundColor White
    Write-Host "================================================" -ForegroundColor Gray

    foreach ($result in $testResults) {
        $status = if ($result.Passed) { "✓ PASS" } else { "✗ FAIL" }
        $color = if ($result.Passed) { "Green" } else { "Red" }

        Write-Host "$status | $($result.Name) | $($result.Status) | $($result.Duration)ms" -ForegroundColor $color
    }

    Write-Host "================================================`n" -ForegroundColor Gray
}

# Main Test Execution
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   WhatsApp Instance Manager - API Test Suite             ║" -ForegroundColor Cyan
Write-Host "║   Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')                      ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n🔍 Phase 1: System Health Check" -ForegroundColor Magenta
Test-API -Name "Health Check - List Instances" -Method "GET" -Endpoint "/instances" -ExpectedStatus 200

# Test 2: Create Instance
Write-Host "`n🔍 Phase 2: Instance Creation" -ForegroundColor Magenta
$newInstance = Test-API -Name "Create New Instance" -Method "POST" -Endpoint "/instances" `
    -Body @{ name = "Test Instance $(Get-Date -Format 'HHmmss')"; brokerType = "uazapi" } `
    -ExpectedStatus 201

if ($newInstance) {
    $instanceId = $newInstance.id
    Write-Host "`n✓ Instance Created: $instanceId" -ForegroundColor Green

    # Test 3: Get Instance Status
    Write-Host "`n🔍 Phase 3: Instance Status Check" -ForegroundColor Magenta
    Test-API -Name "Get Instance Status" -Method "GET" -Endpoint "/instances/$instanceId/status" -ExpectedStatus 200

    # Test 4: Connect Instance (Generate QR Code)
    Write-Host "`n🔍 Phase 4: QR Code Generation" -ForegroundColor Magenta
    $qrResponse = Test-API -Name "Generate QR Code" -Method "POST" -Endpoint "/instances/$instanceId/connect" -ExpectedStatus 200

    if ($qrResponse -and $qrResponse.qrCode) {
        Write-Host "`n✓ QR Code Generated Successfully" -ForegroundColor Green
        Write-Host "QR Code Length: $($qrResponse.qrCode.Length) bytes" -ForegroundColor Gray
        Write-Host "Pairing Code: $($qrResponse.pairingCode)" -ForegroundColor Gray
        Write-Host "Expires In: $($qrResponse.expires)ms" -ForegroundColor Gray
    }

    # Test 5: Try to reconnect (should fail with 400)
    Write-Host "`n🔍 Phase 5: Error Handling - Reconnect Attempt" -ForegroundColor Magenta
    Start-Sleep -Seconds 2
    Test-API -Name "Reconnect Already Connected Instance" -Method "POST" -Endpoint "/instances/$instanceId/connect" -ExpectedStatus 400

    # Test 6: Disconnect Instance
    Write-Host "`n🔍 Phase 6: Instance Disconnection" -ForegroundColor Magenta
    Test-API -Name "Disconnect Instance" -Method "POST" -Endpoint "/instances/$instanceId/disconnect" -ExpectedStatus 200

    # Test 7: Verify disconnected status
    Write-Host "`n🔍 Phase 7: Verify Disconnection" -ForegroundColor Magenta
    $statusAfterDisconnect = Test-API -Name "Check Status After Disconnect" -Method "GET" -Endpoint "/instances/$instanceId/status" -ExpectedStatus 200

    if ($statusAfterDisconnect -and $statusAfterDisconnect.status -eq "disconnected") {
        Write-Host "`n✓ Instance Successfully Disconnected" -ForegroundColor Green
    }

    # Test 8: List all instances
    Write-Host "`n🔍 Phase 8: List All Instances" -ForegroundColor Magenta
    $allInstances = Test-API -Name "List All Instances" -Method "GET" -Endpoint "/instances" -ExpectedStatus 200

    if ($allInstances) {
        Write-Host "`nTotal Instances Found: $($allInstances.Count)" -ForegroundColor Gray
    }

    # Test 9: Delete Instance
    Write-Host "`n🔍 Phase 9: Instance Deletion" -ForegroundColor Magenta
    Test-API -Name "Delete Instance" -Method "DELETE" -Endpoint "/instances/$instanceId" -ExpectedStatus 200

    # Test 10: Verify deletion
    Write-Host "`n🔍 Phase 10: Verify Deletion" -ForegroundColor Magenta
    $finalList = Test-API -Name "List Instances After Deletion" -Method "GET" -Endpoint "/instances" -ExpectedStatus 200

} else {
    Write-Host "`n✗ Instance Creation Failed - Skipping remaining tests" -ForegroundColor Red
}

# Test 11: OpenAPI Spec
Write-Host "`n🔍 Phase 11: OpenAPI Documentation" -ForegroundColor Magenta
Test-API -Name "Get OpenAPI Specification" -Method "GET" -Endpoint "" -ExpectedStatus 200

# Show final summary
Show-TestSummary

# Export results to JSON
$resultsFile = "test\api-test-results_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
$testResults | ConvertTo-Json -Depth 10 | Out-File $resultsFile -Encoding UTF8
Write-Host "Results exported to: $resultsFile" -ForegroundColor Cyan

# Exit with appropriate code
$exitCode = if (($testResults | Where-Object { -not $_.Passed }).Count -eq 0) { 0 } else { 1 }
exit $exitCode