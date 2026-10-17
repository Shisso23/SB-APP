import api.models
import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('firebase_uid', models.CharField(max_length=128, unique=True)),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('is_active', models.BooleanField(default=True)),
                ('is_staff', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            managers=[
                ('objects', api.models.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='AccessEntitlement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('scope', models.CharField(choices=[('predictions', 'Premium predictions')], default='predictions', max_length=40)),
                ('starts_at', models.DateTimeField()),
                ('ends_at', models.DateTimeField()),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='entitlements', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Fixture',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider_id', models.PositiveBigIntegerField(unique=True)),
                ('league_id', models.PositiveIntegerField(db_index=True)),
                ('season', models.PositiveSmallIntegerField()),
                ('home_team_id', models.PositiveBigIntegerField()),
                ('away_team_id', models.PositiveBigIntegerField()),
                ('home_team_name', models.CharField(max_length=200)),
                ('away_team_name', models.CharField(max_length=200)),
                ('kickoff', models.DateTimeField(db_index=True)),
                ('status', models.CharField(max_length=20)),
                ('home_goals', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('away_goals', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('source_updated_at', models.DateTimeField(blank=True, null=True)),
                ('fetched_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('source_payload', models.JSONField(default=dict)),
            ],
            options={
                'indexes': [models.Index(fields=['league_id', 'season', 'kickoff'], name='fixture_league_season_time')],
                'constraints': [models.CheckConstraint(condition=models.Q(('provider_id__gt', 0)), name='fixture_provider_positive')],
            },
        ),
        migrations.CreateModel(
            name='OddsSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('bookmaker', models.CharField(max_length=200)),
                ('market_id', models.CharField(max_length=60)),
                ('decimal_odds', models.DecimalField(decimal_places=8, max_digits=18)),
                ('provider_updated_at', models.DateTimeField(blank=True, null=True)),
                ('captured_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('fixture', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='odds_snapshots', to='api.fixture')),
            ],
        ),
        migrations.CreateModel(
            name='PaymentEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(max_length=80)),
                ('event_id', models.CharField(max_length=200)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('currency', models.CharField(default='ZAR', max_length=3)),
                ('status', models.CharField(choices=[('received', 'Received'), ('pending', 'Pending'), ('completed', 'Completed'), ('failed', 'Failed')], default='received', max_length=20)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('metadata', models.JSONField(default=dict, validators=[api.models.validate_payment_metadata])),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='payment_events', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Prediction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('engine_version', models.CharField(max_length=100)),
                ('input_hash', models.CharField(max_length=64, validators=[django.core.validators.RegexValidator('^[0-9a-f]{64}$', 'A SHA-256 hex digest is required.')])),
                ('config_hash', models.CharField(max_length=64, validators=[django.core.validators.RegexValidator('^[0-9a-f]{64}$', 'A SHA-256 hex digest is required.')])),
                ('generated_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('as_of', models.DateTimeField()),
                ('inputs', models.JSONField(default=dict)),
                ('output', models.JSONField(default=dict)),
                ('fixture', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='predictions', to='api.fixture')),
            ],
            options={
                'ordering': ['-generated_at', '-id'],
            },
        ),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.CheckConstraint(condition=models.Q(('firebase_uid', ''), _negated=True), name='user_uid_nonempty'),
        ),
        migrations.AddIndex(
            model_name='accessentitlement',
            index=models.Index(fields=['user', 'scope', 'ends_at'], name='entitlement_user_scope_end'),
        ),
        migrations.AddConstraint(
            model_name='accessentitlement',
            constraint=models.CheckConstraint(condition=models.Q(('ends_at__gt', models.F('starts_at'))), name='entitlement_positive_window'),
        ),
        migrations.AddIndex(
            model_name='oddssnapshot',
            index=models.Index(fields=['fixture', 'market_id', 'captured_at'], name='odds_fixture_market_time'),
        ),
        migrations.AddConstraint(
            model_name='oddssnapshot',
            constraint=models.CheckConstraint(condition=models.Q(('decimal_odds__gt', Decimal('1'))), name='odds_greater_than_one'),
        ),
        migrations.AddConstraint(
            model_name='paymentevent',
            constraint=models.UniqueConstraint(fields=('provider', 'event_id'), name='payment_provider_event_unique'),
        ),
        migrations.AddConstraint(
            model_name='paymentevent',
            constraint=models.CheckConstraint(condition=models.Q(('amount__gte', 0)), name='payment_amount_nonnegative'),
        ),
        migrations.AddConstraint(
            model_name='prediction',
            constraint=models.UniqueConstraint(fields=('fixture', 'engine_version', 'input_hash', 'config_hash'), name='prediction_version_inputs_unique'),
        ),
    ]
