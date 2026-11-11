"use server";

import { Movie } from "@/lib/db/queries";
import { withConnection } from "./db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function voteAction(movie: Movie, voteType: "up" | "down") {
  const cookieStore = await cookies();

  const existingSessionId = cookieStore.get("sessionId")?.value;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // The check-then-insert and the score update run in one transaction, so a
  // second concurrent vote from the same session cannot slip past the check
  // and throw on the unique (movie_id, session_id) index: the insert uses
  // ON CONFLICT DO NOTHING and a conflicting vote is a no-op instead.
  // The score is computed server-side (score + 1 / -1); the client never
  // supplies it.
  const result = await withConnection(async (client) => {
    await client.query("BEGIN");
    try {
      let sessionId = existingSessionId;
      let isNewSession = false;
      if (!sessionId) {
        const session = await client.query(
          "INSERT INTO sessions (expires_at) VALUES ($1) RETURNING id",
          [expiresAt],
        );
        sessionId = session.rows[0].id;
        isNewSession = true;
      }

      const inserted = await client.query(
        "INSERT INTO votes (session_id, movie_id) VALUES ($1, $2) ON CONFLICT (movie_id, session_id) DO NOTHING RETURNING id",
        [sessionId, movie.id],
      );

      if (inserted.rows.length === 0) {
        // Already voted for this movie (including a concurrent duplicate).
        await client.query("ROLLBACK");
        return { movie, isNewSession, sessionId };
      }

      const delta = voteType === "up" ? 1 : -1;
      const updated = await client.query(
        "UPDATE movies SET score = score + $1, last_vote_time = NOW() WHERE id = $2 RETURNING score, last_vote_time",
        [delta, movie.id],
      );

      await client.query("COMMIT");
      return {
        movie: {
          ...movie,
          score: updated.rows[0].score,
          lastVoteTime: updated.rows[0].last_vote_time,
        },
        isNewSession,
        sessionId,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  if (result.isNewSession && result.sessionId) {
    cookieStore.set("sessionId", String(result.sessionId), {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
  }

  revalidatePath("/");
  return result.movie;
}
