grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.can_view_round_player_cards(uuid) to authenticated;
