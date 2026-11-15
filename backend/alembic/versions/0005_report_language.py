from alembic import op

revision = "0005_report_language"
down_revision = "0004_guide_and_soil"


def upgrade():
    op.execute("ALTER TABLE reports ADD COLUMN language text NOT NULL DEFAULT 'es' CHECK (language IN ('en','es'))")
    op.execute("ALTER TABLE reports DROP CONSTRAINT reports_run_id_rotation_id_template_version_key")
    op.execute("ALTER TABLE reports ADD CONSTRAINT reports_run_rotation_template_language_key UNIQUE(run_id,rotation_id,template_version,language)")


def downgrade():
    # Separate languages may already exist for the same rotation and template.
    # Refuse a lossy rollback instead of deleting a user's report.
    op.execute("ALTER TABLE reports ADD CONSTRAINT reports_run_id_rotation_id_template_version_key UNIQUE(run_id,rotation_id,template_version)")
    op.execute("ALTER TABLE reports DROP CONSTRAINT reports_run_rotation_template_language_key")
    op.execute("ALTER TABLE reports DROP COLUMN language")
