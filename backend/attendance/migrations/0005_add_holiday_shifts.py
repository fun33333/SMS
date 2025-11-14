from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0004_add_multi_level_grade_holidays"),
    ]

    operations = [
        migrations.AddField(
            model_name="holiday",
            name="shifts",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

