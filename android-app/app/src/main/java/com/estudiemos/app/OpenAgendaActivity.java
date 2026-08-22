package com.estudiemos.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

public class OpenAgendaActivity extends Activity {
    public static final String EXTRA_DATE = "agenda_date";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String date = getIntent().getStringExtra(EXTRA_DATE);
        Intent openAgenda = new Intent(this, MainActivity.class)
                .putExtra(MainActivity.EXTRA_OPEN_AGENDA, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (date != null && date.matches("\\d{4}-\\d{2}-\\d{2}")) {
            openAgenda.putExtra(MainActivity.EXTRA_AGENDA_DATE, date);
        }
        startActivity(openAgenda);
        finish();
    }
}
