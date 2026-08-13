# -*- coding: utf-8 -*-
"""
worker/digital-twin/simulator.py

Digital Twin Simulator สำหรับ Phonik ECS-103R V.5
ทำหน้าที่จำลองตู้สาขา PBX แบบ Software-in-the-Loop 100%

Features:
  - รับ TCP Connection บน Port 2323
  - จำลองคำสั่ง CCH2 Protocol: PWER (Power), ROOM (Guest Name), VERS, PASS, STOP
  - แสดง State Dashboard ทุกครั้งที่มีการเปลี่ยนแปลงสถานะห้องพัก
  - รองรับ Multi-client (แต่ละ Connection จัดการแยกกัน)

Usage:
  python simulator.py
  python simulator.py --port 2323 --rooms 4
"""

import asyncio
import logging
import re
import argparse
import sys

# ─── Logging Setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [DigitalTwin] %(message)s',
    datefmt='%H:%M:%S',
)
logger = logging.getLogger('PBX_Simulator')

# ─── PBX State ────────────────────────────────────────────────────────────────
class PBXState:
    """เก็บสถานะจำลองของตู้สาขา PBX"""
    def __init__(self, rooms: list):
        self.power_states: dict[str, int] = {r: 0 for r in rooms}
        self.guest_names:  dict[str, str] = {r: '' for r in rooms}
        self.tcmd_enabled: bool  = False
        self.authenticated: bool = False
        self.command_count: int  = 0

    def print_dashboard(self):
        """แสดง Dashboard สรุปสถานะห้องทั้งหมด"""
        print("\n" + "═" * 50)
        print("  📊 DIGITAL TWIN — ROOM STATUS DASHBOARD")
        print("═" * 50)
        print(f"  {'ROOM':<8} {'POWER':<10} {'GUEST'}")
        print("  " + "─" * 46)
        for room, pwr in sorted(self.power_states.items()):
            status = "🟢 ON " if pwr else "⚫ OFF"
            guest  = self.guest_names.get(room, '') or '—'
            print(f"  {room:<8} {status:<10} {guest}")
        print("═" * 50)
        print(f"  Commands processed: {self.command_count}")
        print("═" * 50 + "\n")


# ─── Simulated Rooms (Floor 01-03, Units 01-03 per floor) ─────────────────────
DEFAULT_ROOMS = [
    '0101', '0102', '0103',
    '0201', '0202', '0203',
    '0301', '0302', '0303',
]

state = PBXState(DEFAULT_ROOMS)

# ─── Command Processor ────────────────────────────────────────────────────────
def process_command(cmd: str) -> str | None:
    """
    แปลงคำสั่ง CCH2 เป็น Response
    คำสั่งทุกตัวต้องขึ้นต้นด้วย '..'
    """
    state.command_count += 1

    if not cmd.startswith('..'):
        return None

    cmd_body = cmd[2:]

    # ─ Auth ────────────────────────────────────────────────────────────────────
    if cmd_body == 'tcmd=1':
        state.tcmd_enabled = True
        return '==ACKW'

    if cmd_body.startswith('PASS='):
        pwd = cmd_body.split('=', 1)[1]
        if pwd == '1234':
            state.authenticated = True
            logger.info('[Auth] ✅ Authenticated.')
            return '==ACKW'
        else:
            logger.warning('[Auth] ❌ Wrong password.')
            return '==NACK'

    if cmd_body == 'STOP':
        return '==STOP'

    if cmd_body in ('VERS=', 'VERS'):
        return '==VERS=ECS-103R V.5 (Digital Twin v2.0)'

    # ─ Power ON/OFF ─────────────────────────────────────────────────────────────
    # Format: ..PWER0101=1 (ON) or ..PWER0101=0 (OFF)
    power_match = re.match(r'^PWER(\d+)=(\d)$', cmd_body)
    if power_match:
        room_raw = power_match.group(1)
        val      = int(power_match.group(2))
        room     = room_raw.zfill(4)

        if room not in state.power_states:
            state.power_states[room] = val  # เพิ่มห้องใหม่อัตโนมัติ

        old_val = state.power_states[room]
        state.power_states[room] = val
        status_str = 'on' if val else 'off'
        
        if old_val != val:  # State เปลี่ยน → แสดง Dashboard
            action = '🟢 POWER ON' if val else '⚫ POWER OFF'
            logger.info(f'[Relay] {action} → Room {room}')
            state.print_dashboard()

        return f'==PWER{room}={status_str}'

    # ─ Get All Power Status ────────────────────────────────────────────────────
    if cmd_body == 'PWER=ALL':
        lines = []
        for r, v in sorted(state.power_states.items()):
            status_str = 'on' if v else 'off'
            lines.append(f'==PWER{r}={status_str}')
        lines.append('==ACKW')
        return '\r\n'.join(lines)

    # ─ Room Guest Name ─────────────────────────────────────────────────────────
    # Format: ..ROOM1017=John (Set) or ..ROOM1017= (Get)
    room_match = re.match(r'^ROOM(\d+)=(.*)$', cmd_body)
    if room_match:
        ext  = int(room_match.group(1))
        name = room_match.group(2).strip()

        # คำนวณเลขห้องจาก Extension (PBX Extension offset)
        room_num = ext - 916 if ext >= 1017 else ext
        room     = str(room_num).zfill(4)

        if name:
            state.guest_names[room] = name
            logger.info(f'[Room] Guest name set: Room {room} = "{name}"')
            return f'==ROOM{room}={name}'
        else:
            current_name = state.guest_names.get(room, '')
            return f'==ROOM{room}={current_name}'

    # ─ Unknown ────────────────────────────────────────────────────────────────
    logger.warning(f'[Sim] Unknown command: {cmd}')
    return f'==NACK=>{cmd_body}'


# ─── TCP Client Handler ────────────────────────────────────────────────────────
async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    addr = writer.get_extra_info('peername')
    logger.info(f'[TCP] New connection from {addr}')

    # ส่ง Prompt เริ่มต้น (เลียนแบบ Telnet ของตู้จริง)
    writer.write(b'.')
    await writer.drain()

    try:
        while True:
            data = await reader.readline()
            if not data:
                break

            raw_cmd = data.decode('utf-8', errors='ignore').strip()
            if not raw_cmd:
                continue

            logger.info(f'[TCP] ← Received: "{raw_cmd}"')
            response = process_command(raw_cmd)

            if response:
                encoded = (response + '\r\n').encode('utf-8')
                writer.write(encoded)
                await writer.drain()
                logger.info(f'[TCP] → Sent: "{response}"')

                if '==STOP' in response:
                    break

    except (ConnectionResetError, asyncio.IncompleteReadError):
        logger.warning(f'[TCP] Connection reset by {addr}')
    except Exception as e:
        logger.error(f'[TCP] Error handling {addr}: {e}')
    finally:
        logger.info(f'[TCP] Connection closed: {addr}')
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


# ─── Main ──────────────────────────────────────────────────────────────────────
async def main(host: str = '0.0.0.0', port: int = 2323):
    server = await asyncio.start_server(handle_client, host, port)
    addr   = server.sockets[0].getsockname()

    print('\n' + '═' * 50)
    print('  🏨 HECS Digital Twin Simulator (v2.0)')
    print('═' * 50)
    print(f'  Listening on  : {addr[0]}:{addr[1]}')
    print(f'  Protocol      : CCH2 (Phonik ECS-103R V.5)')
    print(f'  Simulated rooms: {", ".join(sorted(state.power_states.keys()))}')
    print('  Press Ctrl+C to stop')
    print('═' * 50 + '\n')

    # แสดง State Dashboard เริ่มต้น
    state.print_dashboard()

    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='HECS Digital Twin PBX Simulator')
    parser.add_argument('--port', type=int, default=2323, help='TCP Port (default: 2323)')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Bind host (default: 0.0.0.0)')
    args = parser.parse_args()

    try:
        asyncio.run(main(host=args.host, port=args.port))
    except KeyboardInterrupt:
        logger.info('\n[Simulator] Stopped by user.')
        sys.exit(0)
