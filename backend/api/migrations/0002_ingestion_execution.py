import django.core.validators
import django.db.models.deletion
import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProviderBudget',
            fields=[
                ('id', models.PositiveSmallIntegerField(default=1, primary_key=True, serialize=False)),
                ('day', models.DateField()),
                ('minute', models.DateTimeField()),
                ('daily_requests', models.PositiveIntegerField(default=0)),
                ('minute_requests', models.PositiveIntegerField(default=0)),
                ('blocked_until', models.DateTimeField(null=True)),
            ],
        ),
        migrations.AddField(
            model_name='oddssnapshot',
            name='margin_adjusted_probability',
            field=models.DecimalField(blank=True, decimal_places=10, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='prediction',
            name='configuration',
            field=models.JSONField(default=dict),
        ),
        migrations.AddField(
            model_name='prediction',
            name='provenance',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='prediction',
            name='valid_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='JobRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(max_length=20)),
                ('scope', models.CharField(max_length=80)),
                ('slot', models.DateTimeField()),
                ('status', models.CharField(default='running', max_length=20)),
                ('claim_token', models.UUIDField(default=uuid.uuid4)),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('requests', models.PositiveIntegerField(default=0)),
                ('checkpoint', models.JSONField(default=dict)),
                ('started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('finished_at', models.DateTimeField(null=True)),
                ('retry_after', models.DateTimeField(null=True)),
                ('error_code', models.CharField(blank=True, max_length=80)),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('kind', 'scope', 'slot'), name='job_slot_unique')],
            },
        ),
        migrations.CreateModel(
            name='SourceObservation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(max_length=20)),
                ('scope', models.CharField(max_length=100)),
                ('observed_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('provider_updated_at', models.DateTimeField(blank=True, null=True)),
                ('content_hash', models.CharField(max_length=64, validators=[django.core.validators.RegexValidator('^[0-9a-f]{64}$', 'A SHA-256 hex digest is required.')])),
                ('payload', models.JSONField()),
                ('job', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='api.jobrun')),
            ],
        ),
        migrations.CreateModel(
            name='Settlement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('market_id', models.CharField(max_length=60)),
                ('home_goals', models.PositiveSmallIntegerField()),
                ('away_goals', models.PositiveSmallIntegerField()),
                ('outcome', models.BooleanField(null=True)),
                ('profit', models.DecimalField(decimal_places=8, max_digits=18)),
                ('settled_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('correction_flagged_at', models.DateTimeField(blank=True, null=True)),
                ('prediction', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='settlements', to='api.prediction')),
                ('correction_observation', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='flagged_settlements', to='api.sourceobservation')),
                ('result_observation', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='api.sourceobservation')),
            ],
        ),
        migrations.AddField(
            model_name='oddssnapshot',
            name='source',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='api.sourceobservation'),
        ),
        migrations.AddConstraint(
            model_name='oddssnapshot',
            constraint=models.UniqueConstraint(fields=('source', 'fixture', 'bookmaker', 'market_id'), name='quote_source_market_unique'),
        ),
        migrations.AddIndex(
            model_name='sourceobservation',
            index=models.Index(fields=['kind', 'scope', 'observed_at'], name='observation_scope_time'),
        ),
        migrations.AddConstraint(
            model_name='sourceobservation',
            constraint=models.UniqueConstraint(fields=('job', 'kind', 'scope', 'content_hash'), name='observation_job_payload_unique'),
        ),
        migrations.AddConstraint(
            model_name='settlement',
            constraint=models.UniqueConstraint(fields=('prediction', 'market_id'), name='settlement_prediction_market_unique'),
        ),
    ]
