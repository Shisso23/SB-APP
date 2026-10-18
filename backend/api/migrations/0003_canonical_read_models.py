import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_ingestion_execution'),
    ]

    operations = [
        migrations.CreateModel(
            name='LeagueCatalog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider_id', models.PositiveIntegerField(unique=True)),
                ('payload', models.JSONField()),
                ('observed_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                'constraints': [models.CheckConstraint(condition=models.Q(('provider_id__gt', 0)), name='league_provider_positive')],
            },
        ),
        migrations.CreateModel(
            name='StandingsSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('league_id', models.PositiveIntegerField(db_index=True)),
                ('season', models.PositiveSmallIntegerField()),
                ('observed_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('payload', models.JSONField()),
                ('source', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='api.sourceobservation')),
            ],
            options={
                'indexes': [models.Index(fields=['league_id', 'season', 'observed_at'], name='standings_league_season_time')],
                'constraints': [models.UniqueConstraint(fields=('source',), name='standings_source_unique')],
            },
        ),
    ]
