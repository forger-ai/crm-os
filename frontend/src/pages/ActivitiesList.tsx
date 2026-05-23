import { useEffect, useMemo, useState } from "react";
import {
  Box,
  CircularProgress,
  List,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  completeActivity,
  deleteActivity,
  listActivities,
} from "../api/activities";
import type { ActivityKind, ActivityRead } from "../api/types";
import ActivityRow from "../components/ActivityRow";
import EmptyState from "../components/EmptyState";

type CompletedFilter = "" | "true" | "false";

export default function ActivitiesList() {
  const [activities, setActivities] = useState<ActivityRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<ActivityKind | "">("");
  const [completedFilter, setCompletedFilter] = useState<CompletedFilter>("false");

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const rows = await listActivities({
          kind: kindFilter || undefined,
          completed:
            completedFilter === ""
              ? undefined
              : completedFilter === "true",
          page_size: 200,
        });
        setActivities(rows);
      } finally {
        setLoading(false);
      }
    },
    [kindFilter, completedFilter],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Actividades
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 2 }}>
          <TextField
            select
            size="small"
            label="Tipo"
            value={kindFilter}
            onChange={(event) =>
              setKindFilter(event.target.value as ActivityKind | "")
            }
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="call">Llamadas</MenuItem>
            <MenuItem value="email">Emails</MenuItem>
            <MenuItem value="meeting">Reuniones</MenuItem>
            <MenuItem value="task">Tareas</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Estado"
            value={completedFilter}
            onChange={(event) =>
              setCompletedFilter(event.target.value as CompletedFilter)
            }
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="false">Pendientes</MenuItem>
            <MenuItem value="true">Completadas</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : activities.length === 0 ? (
        <EmptyState
          title="Sin actividades"
          description="Crea actividades desde un deal, contacto o empresa."
        />
      ) : (
        <Paper variant="outlined">
          <List dense disablePadding>
            {activities.map((activity) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                onComplete={async () => {
                  await completeActivity(activity.id);
                  await refresh();
                }}
                onDelete={async () => {
                  await deleteActivity(activity.id);
                  await refresh();
                }}
              />
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
