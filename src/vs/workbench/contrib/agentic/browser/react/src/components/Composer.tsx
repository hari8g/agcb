import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listAgentSkills, type AgentSkill } from '../../../../common/agentSkills.js';
import { COMPOSER_AGENT_MODES, type ComposerAgentModeId } from '../../../../common/agentModes.js';
import {
	getChatService,
	setVoidChatModel,
	useVoidChatModels,
} from '../util/agenticServices.js';

type ContextChip = {
	id: string;
	label: string;
	active: boolean;
	onToggle: () => void;
};

type PickerKind = 'slash' | 'mention' | null;

export function Composer({
	onSend,
	onStop,
	isRunning,
	includeActiveFile,
	includeSelection,
	autoApplyEdits,
	agentModeId,
	onAgentModeChange,
	onToggleActiveFile,
	onToggleSelection,
	onToggleAutoApply,
}: {
	onSend: (text: string) => void;
	onStop: () => void;
	isRunning: boolean;
	includeActiveFile: boolean;
	includeSelection: boolean;
	autoApplyEdits: boolean;
	agentModeId: ComposerAgentModeId;
	onAgentModeChange: (modeId: ComposerAgentModeId) => void;
	onToggleActiveFile: () => void;
	onToggleSelection: () => void;
	onToggleAutoApply: () => void;
}) {
	const [text, setText] = useState('');
	const [picker, setPicker] = useState<PickerKind>(null);
	const [pickerIndex, setPickerIndex] = useState(0);
	const [mentionHits, setMentionHits] = useState<{ path: string; score: number }[]>([]);
	const { models, selection } = useVoidChatModels();
	const skills = listAgentSkills();
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const chips: ContextChip[] = [
		{ id: 'file', label: 'File', active: includeActiveFile, onToggle: onToggleActiveFile },
		{ id: 'selection', label: 'Selection', active: includeSelection, onToggle: onToggleSelection },
		{ id: 'auto', label: 'Auto-apply', active: autoApplyEdits, onToggle: onToggleAutoApply },
	];

	const selectedModelKey = selection
		? `${selection.providerName}::${selection.modelName}`
		: '';

	const updatePicker = useCallback((value: string, cursor: number) => {
		const before = value.slice(0, cursor);
		const slashMatch = before.match(/(?:^|\s)\/([\w-]*)$/);
		if (slashMatch) {
			setPicker('slash');
			setPickerIndex(0);
			return;
		}
		const mentionMatch = before.match(/(?:^|\s)@([\w./\\-]*)$/);
		if (mentionMatch) {
			setPicker('mention');
			setPickerIndex(0);
			const q = mentionMatch[1] ?? '';
			void getChatService().searchComposerContext(q).then(hits => setMentionHits(hits.slice(0, 8)));
			return;
		}
		setPicker(null);
		setMentionHits([]);
	}, []);

	const applySkill = (skill: AgentSkill) => {
		const base = text.replace(/(?:^|\s)\/[\w-]*$/, '').trimEnd();
		const next = `${base}${base ? ' ' : ''}${skill.slash} `;
		setText(next);
		setPicker(null);
		inputRef.current?.focus();
	};

	const applyMention = (path: string) => {
		const rel = path.split(/[/\\]/).slice(-3).join('/');
		const base = text.replace(/(?:^|\s)@[\w./\\-]*$/, '').trimEnd();
		const next = `${base}${base ? ' ' : ''}@${rel} `;
		setText(next);
		setPicker(null);
		inputRef.current?.focus();
	};

	const submit = () => {
		const trimmed = text.trim();
		if (!trimmed || isRunning) {
			return;
		}
		onSend(trimmed);
		setText('');
		setPicker(null);
	};

	const filteredSkills = skills.filter(s =>
		!picker || picker !== 'slash' || s.slash.slice(1).toLowerCase().startsWith((text.match(/\/([\w-]*)$/)?.[1] ?? '').toLowerCase()),
	);

	useEffect(() => {
		if (!picker) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setPicker(null);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [picker]);

	const SendIcon = () => (
		<svg className="agentic-composer-send-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
			<path
				d="M12 5v14M12 5l-5.5 5.5M12 5l5.5 5.5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);

	const ChipCheck = () => (
		<svg className="agentic-chat-chip__check" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
			<path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);

	return (
		<footer className="agentic-chat-composer">
			{picker && (
				<div className="agentic-composer-picker" role="listbox">
					{picker === 'slash' && filteredSkills.map((s, i) => (
						<button
							key={s.id}
							type="button"
							className={`agentic-composer-picker__item${i === pickerIndex ? ' agentic-composer-picker__item--active' : ''}`}
							onMouseDown={e => {
								e.preventDefault();
								applySkill(s);
							}}
						>
							<span className="agentic-composer-picker__cmd">{s.slash}</span>
							<span className="agentic-composer-picker__label">{s.label}</span>
							<span className="agentic-composer-picker__hint">{s.description}</span>
						</button>
					))}
					{picker === 'mention' && mentionHits.map((h, i) => (
						<button
							key={h.path}
							type="button"
							className={`agentic-composer-picker__item${i === pickerIndex ? ' agentic-composer-picker__item--active' : ''}`}
							onMouseDown={e => {
								e.preventDefault();
								applyMention(h.path);
							}}
						>
							<span className="agentic-composer-picker__label">{h.path}</span>
						</button>
					))}
					{picker === 'mention' && mentionHits.length === 0 && (
						<div className="agentic-composer-picker__empty">Type to search files…</div>
					)}
				</div>
			)}

			<div className="agentic-composer-dock">
				<div className="agentic-chat-composer__surface">
					<div className="agentic-composer-toolbar" role="toolbar" aria-label="Agent controls">
						<label className="agentic-composer-model">
							<span className="agentic-composer-model__label" aria-hidden>Model</span>
							<div className="agentic-composer-model__select-wrap">
								<select
									className="agentic-composer-select"
									value={selectedModelKey}
									disabled={isRunning || !models.length}
									onChange={e => {
										const [providerName, modelName] = e.target.value.split('::');
										if (providerName && modelName) {
											setVoidChatModel(providerName, modelName);
										}
									}}
									aria-label="Chat model"
								>
									{!models.length && <option value="">No models</option>}
									{models.map(m => (
										<option key={`${m.providerName}::${m.modelName}`} value={`${m.providerName}::${m.modelName}`}>
											{m.label}
										</option>
									))}
								</select>
							</div>
						</label>
						<div className="agentic-composer-mode-switch" role="group" aria-label="Agent mode">
							{COMPOSER_AGENT_MODES.map(mode => (
								<button
									key={mode.id}
									type="button"
									className={`agentic-mode-pill${agentModeId === mode.id ? ' agentic-mode-pill--active' : ''}`}
									title={mode.description}
									disabled={isRunning}
									aria-pressed={agentModeId === mode.id}
									onClick={() => onAgentModeChange(mode.id)}
								>
									{mode.shortLabel}
								</button>
							))}
						</div>
					</div>

					<div className="agentic-composer-input-wrap">
						<textarea
							ref={inputRef}
							className="agentic-chat-composer__input"
							value={text}
							onChange={e => {
								setText(e.target.value);
								updatePicker(e.target.value, e.target.selectionStart ?? e.target.value.length);
							}}
							onClick={e => updatePicker(text, e.currentTarget.selectionStart ?? text.length)}
							placeholder="Message the agent…"
							rows={2}
							onKeyDown={e => {
								if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !picker) {
									e.preventDefault();
									submit();
								}
							}}
						/>
						<div className="agentic-composer-input__actions">
							{isRunning ? (
								<button
									type="button"
									className="agentic-chat-composer__send agentic-chat-composer__send--stop"
									onClick={onStop}
								>
									Stop
								</button>
							) : (
								<button
									type="button"
									className={`agentic-chat-composer__send${text.trim() ? ' agentic-chat-composer__send--ready' : ''}`}
									disabled={!text.trim()}
									onClick={submit}
									aria-label="Send message"
								>
									<SendIcon />
								</button>
							)}
						</div>
					</div>

					<div className="agentic-chat-composer__footer">
						<div className="agentic-chat-composer__chips" role="group" aria-label="Context">
							{chips.map(chip => (
								<button
									key={chip.id}
									type="button"
									className={`agentic-chat-chip${chip.active ? ' agentic-chat-chip--on' : ''}`}
									aria-pressed={chip.active}
									onClick={chip.onToggle}
								>
									{chip.active ? <ChipCheck /> : <span className="agentic-chat-chip__indicator" aria-hidden />}
									<span className="agentic-chat-chip__label">{chip.label}</span>
								</button>
							))}
						</div>
						<p className="agentic-composer-hint" aria-hidden>
							<kbd className="agentic-kbd">↵</kbd>
							<span>send</span>
							<span className="agentic-composer-hint__sep">·</span>
							<kbd className="agentic-kbd">⇧↵</kbd>
							<span>new line</span>
						</p>
					</div>
				</div>
			</div>
		</footer>
	);
}
