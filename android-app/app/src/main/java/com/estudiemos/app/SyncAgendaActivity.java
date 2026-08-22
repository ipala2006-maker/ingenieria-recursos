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
        String streak = data == null ? null : data.getQueryParameter("streak");
        if (agenda != null && !agenda.isEmpty()) {
            AgendaWidgetProvider.storeAgendaItems(this, agenda);
            if (streak != null && !streak.isEmpty()) {
                StreakWidgetProvider.storeStreakHistory(this, streak);
            }
            Toast.makeText(this, "Widgets de Estudiemos actualizados", Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, "No se encontraron datos para actualizar", Toast.LENGTH_SHORT).show();
        }
        finish();
    }
}
