package com.estudiemos.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

public class OpenAgendaActivity extends Activity {
    public static final String EXTRA_DATE = "agenda_date";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String date = getIntent().getStringExtra(EXTRA_DATE);
        StringBuilder url = new StringBuilder("https://estudiemos-app.vercel.app/?agenda=1");
        if (date != null && date.matches("\\d{4}-\\d{2}-\\d{2}")) {
            url.append("&date=").append(Uri.encode(date));
        }
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url.toString())));
        finish();
    }
}
