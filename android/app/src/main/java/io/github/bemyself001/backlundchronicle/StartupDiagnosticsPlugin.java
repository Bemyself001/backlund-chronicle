package io.github.bemyself001.backlundchronicle;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StartupDiagnostics")
public class StartupDiagnosticsPlugin extends Plugin {
    @PluginMethod public void recoverInput(PluginCall call) {
        Integer requestId = call.getInt("requestId");
        getActivity().runOnUiThread(() -> {
            InputFocusGuard guard = ((MainActivity) getActivity()).inputFocus;
            if (guard == null || requestId == null) { call.reject("Input recovery unavailable"); return; }
            guard.recover(requestId, call::resolve);
        });
    }
    @PluginMethod public void getInfo(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(((MainActivity) getActivity()).startupDiagnostics.info()));
    }
    @PluginMethod public void ready(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).startupDiagnostics.ready();
            call.resolve();
        });
    }
}
