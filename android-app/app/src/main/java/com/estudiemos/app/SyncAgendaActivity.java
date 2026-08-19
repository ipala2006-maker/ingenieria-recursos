package com.estudiemos.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

public class SyncAgendaActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri data = getIntent().getData();
        String agenda = data == null ? null : data.getQueryParameter("data");
        if (agenda != null && !agenda.isEmpty()) {
            AgendaWidgetProvider.storeAgendaItems(this, agenda);
            Toast.makeText(this, "Widgets de Estudiemos actualizados", Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, "No se encontraron datos para actualizar", Toast.LENGTH_SHORT).show();
        }
        finish();
    }
}
