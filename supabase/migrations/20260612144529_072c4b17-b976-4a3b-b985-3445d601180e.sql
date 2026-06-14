INSERT INTO public.tipos_conteudo (nome, cor, ativo, ordem)
SELECT 'Documentário', '#059669', true, 6
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_conteudo WHERE nome = 'Documentário');

UPDATE public.programas
SET tipo_conteudo_id = (SELECT id FROM public.tipos_conteudo WHERE nome = 'Documentário')
WHERE nome = 'Documentários' AND tipo_conteudo_id IS NULL;

UPDATE public.programas
SET tipo_conteudo_id = (SELECT id FROM public.tipos_conteudo WHERE nome = 'Promoções')
WHERE nome = 'Promoções' AND tipo_conteudo_id IS NULL;