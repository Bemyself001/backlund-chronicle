package io.github.bemyself001.backlundchronicle;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StartupDiagnostics")
public class StartupDiagnosticsPlugin extends Plugin {
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
