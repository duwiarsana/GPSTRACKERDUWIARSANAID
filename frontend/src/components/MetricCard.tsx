import { Paper, Stack, Typography, Avatar, useTheme, Fade } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useEffect, useRef, memo } from 'react';

type MetricColor = 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  caption?: string;
  icon?: ReactNode;
  color?: MetricColor;
  compact?: boolean;
  inlineLabel?: boolean;
  valueKey?: string | number;
  animate?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, caption, icon, color = 'primary', compact = false, inlineLabel = false, valueKey, animate = false }) => {
  const theme = useTheme();
  const prevKeyRef = useRef<string | number | undefined>(undefined);
  const hasChanged = animate && valueKey !== undefined && prevKeyRef.current !== undefined && prevKeyRef.current !== valueKey;
  useEffect(() => {
    prevKeyRef.current = valueKey;
  }, [valueKey]);

  const paletteColor = (
    {
      primary: theme.palette.primary,
      secondary: theme.palette.secondary,
      success: theme.palette.success,
      warning: theme.palette.warning,
      info: theme.palette.info,
      error: theme.palette.error,
    } as Record<MetricColor, typeof theme.palette.primary>
  )[color];

  return (
    <Paper elevation={0} sx={{
      p: compact ? 1.5 : 2.5,
      height: '100%',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
      borderRadius: 2,
      transition: 'background-color 350ms ease, backdrop-filter 350ms ease, border-color 350ms ease, box-shadow 350ms ease',
    }}>
      <Stack direction="row" alignItems="center" spacing={compact ? 1.5 : 2}>
        {icon && (
          <Avatar
            variant="rounded"
            sx={{
              bgcolor: alpha(paletteColor.main, 0.12),
              color: paletteColor.main,
              border: `1px solid ${alpha(paletteColor.main, 0.24)}`,
              width: compact ? 36 : 44,
              height: compact ? 36 : 44,
            }}
          >
            {icon}
          </Avatar>
        )}
        <Stack spacing={compact ? 0.25 : 0.5}>
          {inlineLabel ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              {hasChanged ? (
                <Fade in timeout={250}>
                  <Typography
                    variant={compact ? 'h5' : 'h4'}
                    component="div"
                    sx={{
                      fontWeight: 700,
                      lineHeight: 1,
                      fontSize: { xs: theme.typography.h5.fontSize, md: theme.typography.h3.fontSize },
                    }}
                  >
                    {value}
                  </Typography>
                </Fade>
              ) : (
                <Typography
                  variant={compact ? 'h5' : 'h4'}
                  component="div"
                  sx={{
                    fontWeight: 700,
                    lineHeight: 1,
                    fontSize: { xs: theme.typography.h5.fontSize, md: theme.typography.h3.fontSize },
                  }}
                >
                  {value}
                </Typography>
              )}
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {label}
              </Typography>
            </Stack>
          ) : (
            <>
              <Typography variant={compact ? 'caption' : 'subtitle2'} color="text.secondary">
                {label}
              </Typography>
              {hasChanged ? (
                <Fade in timeout={250}>
                  <Typography variant={compact ? 'h6' : 'h5'} component="div">
                    {value}
                  </Typography>
                </Fade>
              ) : (
                <Typography variant={compact ? 'h6' : 'h5'} component="div">
                  {value}
                </Typography>
              )}
            </>
          )}
          {!compact && !inlineLabel && caption && (
            <Typography variant="caption" color="text.secondary">
              {caption}
            </Typography>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
;

export default memo(MetricCard, (prev, next) => {
  // If valueKey provided, it's the canonical change detector
  if (prev.valueKey !== next.valueKey) return false;
  // Also compare label and compact/inline settings that affect layout
  if (prev.label !== next.label) return false;
  if (prev.compact !== next.compact) return false;
  if (prev.inlineLabel !== next.inlineLabel) return false;
  if (prev.color !== next.color) return false;
  return true;
});
