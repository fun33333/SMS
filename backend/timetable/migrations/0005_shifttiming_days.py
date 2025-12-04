from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('timetable', '0004_shifttiming'),
    ]

    operations = [
        migrations.AddField(
            model_name='shifttiming',
            name='days',
            field=models.JSONField(blank=True, default=list, help_text="Days this timing applies to (e.g., ['Monday', 'Tuesday']). Empty means all days.", null=True),
        ),
    ]
