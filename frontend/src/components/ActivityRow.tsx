import {
  Chip,
  IconButton,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
} from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import EmailIcon from "@mui/icons-material/Email";
import EventIcon from "@mui/icons-material/Event";
import TaskIcon from "@mui/icons-material/CheckBoxOutlined";
import DoneIcon from "@mui/icons-material/Done";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import type { ActivityKind, ActivityRead } from "../api/types";
import { formatDateTime } from "../utils/format";

const ICONS: Record<ActivityKind, JSX.Element> = {
  call: <CallIcon fontSize="small" />,
  email: <EmailIcon fontSize="small" />,
  meeting: <EventIcon fontSize="small" />,
  task: <TaskIcon fontSize="small" />,
};

interface Props {
  activity: ActivityRead;
  onComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function statusChip(activity: ActivityRead) {
  if (activity.pending_send) {
    return (
      <Chip size="small" label="Borrador por enviar" color="info" variant="outlined" />
    );
  }
  if (activity.completed_at) {
    return <Chip size="small" label="Completada" color="success" variant="outlined" />;
  }
  if (activity.due_at && new Date(activity.due_at) < new Date()) {
    return <Chip size="small" label="Vencida" color="warning" variant="outlined" />;
  }
  if (activity.due_at) {
    return <Chip size="small" label="Pendiente" variant="outlined" />;
  }
  return <Chip size="small" label="Sin vencimiento" variant="outlined" />;
}

function providerChip(activity: ActivityRead) {
  if (activity.external_provider === "gmail") {
    return <Chip size="small" label="Gmail" color="primary" variant="outlined" />;
  }
  return null;
}

export default function ActivityRow({ activity, onComplete, onDelete }: Props) {
  return (
    <ListItem
      divider
      secondaryAction={
        <Stack direction="row" spacing={0.5}>
          {!activity.completed_at && onComplete && (
            <Tooltip title="Marcar como completada">
              <IconButton size="small" onClick={() => onComplete(activity.id)}>
                <DoneIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="Eliminar">
              <IconButton size="small" onClick={() => onDelete(activity.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      }
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1 }}>
        {ICONS[activity.kind]}
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} alignItems="center">
              <span style={{ fontWeight: 600 }}>{activity.subject}</span>
              {statusChip(activity)}
              {providerChip(activity)}
            </Stack>
          }
          secondary={
            <Stack direction="row" spacing={2}>
              {activity.kind === "email" && activity.from_email ? (
                <span>De: {activity.from_email}</span>
              ) : (
                <span>Vence: {formatDateTime(activity.due_at)}</span>
              )}
              {activity.owner && <span>· {activity.owner}</span>}
            </Stack>
          }
        />
      </Stack>
    </ListItem>
  );
}
