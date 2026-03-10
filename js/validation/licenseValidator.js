export function validate(state) {
    const results = [];
    if (!state.licenseData.isLoaded) return results;

    if (!state.licenseData.serverLineHasPort) {
        results.push({
            severity: "warning",
            directiveId: null,
            message: "No port number specified on the SERVER line in your license file. Setting a fixed port avoids conflicts when restarting FlexLM.",
            action: { label: "Set port to 27000", type: "license-fix", fixType: "server-port", value: 27000 }
        });
    }

    if (!state.licenseData.daemonLineHasPort) {
        results.push({
            severity: "warning",
            directiveId: null,
            message: "No port number specified on the DAEMON line in your license file. A random port will be chosen each time FlexLM restarts.",
            action: { label: "Set port to 27010", type: "license-fix", fixType: "daemon-port", value: 27010 }
        });
    }

    return results;
}
