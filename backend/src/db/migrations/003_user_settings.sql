-- 用户显示设置表
CREATE TABLE IF NOT EXISTS user_settings (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  font_size             VARCHAR(20) DEFAULT 'medium',    -- small/medium/large
  card_density          VARCHAR(20) DEFAULT 'normal',     -- compact/normal/spacious
  line_spacing          VARCHAR(20) DEFAULT 'normal',     -- tight/normal/relaxed
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 触发器：自动更新updated_at
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 初始化默认设置
INSERT INTO user_settings (id) VALUES (1) ON CONFLICT DO NOTHING;