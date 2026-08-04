import { useRef, useState } from "react";
import { ApiError, importarXML, type ResumoImportacao } from "../../api/inventarios";

interface ImportXMLButtonProps {
  /** Data do dia em que o XML será importado (RF16). */
  data: string;
  onImportado: (resumo: ResumoImportacao) => void;
  onErro: (mensagem: string) => void;
}

/**
 * Botão "Importar XML do dia" + o input de arquivo escondido
 * (docs/componentes-react.md). O arquivo é enviado cru para o backend: o
 * navegador não abre, não interpreta e não decide nada sobre o conteúdo
 * (RF07, docs/fluxo-de-telas.md seção 3).
 */
export default function ImportXMLButton({ data, onImportado, onErro }: ImportXMLButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const handleArquivoSelecionado = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setEnviando(true);
    try {
      const resumo = await importarXML(data, arquivo);
      onImportado(resumo);
    } catch (e) {
      onErro(
        e instanceof ApiError
          ? e.message
          : "Não foi possível enviar o arquivo. Verifique a conexão e tente de novo."
      );
    } finally {
      setEnviando(false);
      // Zera o input para que escolher o MESMO arquivo de novo volte a
      // disparar o change (reimportar é permitido e esperado — RN13).
      event.target.value = "";
    }
  };

  return (
    <div className="import-xml">
      <button type="button" onClick={() => inputRef.current?.click()} disabled={enviando}>
        {enviando ? "Importando..." : "Importar XML do dia"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        hidden
        onChange={handleArquivoSelecionado}
      />
    </div>
  );
}
